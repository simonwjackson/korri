import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
  type MoonlightControlClientOptions,
  type MoonlightControlEventDelivery,
  type MoonlightControlSequenceGap,
} from "@shared/stream/moonlight-control-client"
import {
  MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
  type MoonlightControlAnyCommandMethod,
  type MoonlightControlEventsSubscribedResult,
  type MoonlightControlHelloResult,
  type MoonlightControlResponseResult,
  type MoonlightControlStateSnapshotResult,
  type MoonlightControlSuccessResponse,
} from "@shared/stream/moonlight-control-protocol"
import {
  MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
  MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
  type MoonlightRuntimeWatchArtifact,
  type MoonlightRuntimeWatchProof,
  type MoonlightRuntimeWatchScenario,
  type MoonlightRuntimeWatchTerminalResult,
} from "@shared/stream/moonlight-runtime-watch-artifact"
import { runtimeWatchArtifactPath } from "../artifacts/paths"

const DEFAULT_TIMEOUT_MS = 5000

const exitCodes = {
  success: 0,
  usage: 2,
  attachFailed: 20,
  localRejected: 30,
  hostRejected: 31,
  sentNoTerminalOutcome: 32,
  inconclusive: 33,
  cancelled: 34,
  artifactWriteFailed: 40,
} as const

export interface MoonlightRuntimeWatchCommandIo {
  readonly connect?: (
    options: MoonlightControlClientOptions,
  ) => Promise<MoonlightControlClient>
  readonly write?: (line: string) => void
  readonly writeError?: (line: string) => void
  readonly writeArtifact?: (path: string, content: string) => Promise<void>
  readonly createRunId?: () => string
  readonly now?: () => Date
}

interface ParsedCommand {
  readonly scenario: MoonlightRuntimeWatchScenario
  readonly socketPath: string
  readonly artifactPath: string
  readonly timeoutMs: number
}

interface WatchContext {
  readonly runId: string
  readonly startedAt: Date
  readonly socketPath: string
  readonly artifactPath: string
  readonly scenario: MoonlightRuntimeWatchScenario
  readonly observedEvents: MoonlightControlEventDelivery[]
  readonly sequenceGaps: MoonlightControlSequenceGap[]
  hello?: MoonlightControlHelloResult
  preSnapshot?: MoonlightControlStateSnapshotResult
  postSnapshot?: MoonlightControlStateSnapshotResult
  subscription?: MoonlightControlEventsSubscribedResult
  commandResponse?: MoonlightControlResponseResult
  error?: { readonly category: string; readonly message: string }
}

interface TerminalClassification {
  readonly result: MoonlightRuntimeWatchTerminalResult
  readonly exitCode: number
  readonly reason?: string
  readonly proof: MoonlightRuntimeWatchProof
}

export async function runMoonlightRuntimeWatchCommand(
  argv: readonly string[],
  io: MoonlightRuntimeWatchCommandIo = {},
): Promise<number> {
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  const now = io.now ?? (() => new Date())
  const createRunId = io.createRunId ?? (() => randomUUID())
  const writeArtifact = io.writeArtifact ?? writeArtifactFile
  const runId = createRunId()
  const parsed = parseCommand(argv, runId)

  if (typeof parsed === "string") {
    writeError(parsed)
    return exitCodes.usage
  }

  const context: WatchContext = {
    runId,
    startedAt: now(),
    socketPath: parsed.socketPath,
    artifactPath: parsed.artifactPath,
    scenario: parsed.scenario,
    observedEvents: [],
    sequenceGaps: [],
  }

  let client: MoonlightControlClient | undefined
  let terminal: TerminalClassification

  try {
    const connect = io.connect ?? connectMoonlightControl
    client = await connect({
      socketPath: parsed.socketPath,
      onSequenceGap: gap => context.sequenceGaps.push(gap),
    })
    terminal = await runScenario(client, parsed, context)
  } catch (error) {
    context.error = { category: "attach", message: errorMessage(error) }
    terminal = {
      result: "attach-failed",
      exitCode: exitCodes.attachFailed,
      reason: errorMessage(error),
      proof: notCollectedProof(),
    }
  } finally {
    client?.close()
  }

  return writeArtifactAndSummary({
    context,
    terminal,
    completedAt: now(),
    writeArtifact,
    write,
  })
}

async function runScenario(
  client: MoonlightControlClient,
  parsed: ParsedCommand,
  context: WatchContext,
): Promise<TerminalClassification> {
  const unsubscribe = client.onEvent(delivery => {
    context.observedEvents.push(delivery)
  })

  try {
    context.hello = expectHello(await client.hello())
    context.preSnapshot = expectStateSnapshot(await client.state())
    context.subscription = expectSubscription(await client.subscribe())

    if (parsed.scenario._tag === "probe") {
      return {
        result: "probe-succeeded",
        exitCode: exitCodes.success,
        proof: {
          controlPlane: "observed",
          hostApply: "not-collected",
          deviceRender: "not-collected",
        },
      }
    }

    const validationError = validateMutation(parsed.scenario, context.hello)
    if (validationError) {
      return {
        result: "local-rejected",
        exitCode: exitCodes.localRejected,
        reason: validationError,
        proof: {
          controlPlane: "observed",
          hostApply: "not-collected",
          deviceRender: "not-collected",
        },
      }
    }

    const commandResponse = await sendMutation(client, parsed.scenario)
    context.commandResponse = commandResponse.result
    const requestId = String(extractCommandRequestId(commandResponse.result))
    const command = extractScenarioCommand(parsed.scenario)
    const existing = findMatchingCommandEvent(context.observedEvents, requestId)
    const commandResult =
      existing ??
      (await waitForCommandResult({
        client,
        observedEvents: context.observedEvents,
        requestId,
        timeoutMs: parsed.timeoutMs,
      }))

    if (commandResult) {
      context.postSnapshot = expectStateSnapshot(await client.state())
      return classifyCommandResult({
        result: commandResult,
        scenario: parsed.scenario,
        postSnapshot: context.postSnapshot,
      })
    }

    if (context.sequenceGaps.length > 0) {
      context.postSnapshot = expectStateSnapshot(await client.state())
      const lastCommand = context.postSnapshot.runtimeSettings.lastCommand
      if (lastCommand && String(lastCommand.requestId) === requestId) {
        return classifyCommandResult({
          result: {
            _tag: "command.result",
            requestId,
            command,
            status: lastCommand.status,
          },
          scenario: parsed.scenario,
          postSnapshot: context.postSnapshot,
        })
      }
      return {
        result: "inconclusive",
        exitCode: exitCodes.inconclusive,
        reason: "sequence gap without matching terminal command state",
        proof: {
          controlPlane: "resynced",
          hostApply: "not-collected",
          deviceRender: "not-collected",
        },
      }
    }

    return {
      result: "sent-no-terminal-outcome",
      exitCode: exitCodes.sentNoTerminalOutcome,
      reason: "no correlated command result before timeout",
      proof: {
        controlPlane: "observed",
        hostApply: "not-collected",
        deviceRender: "not-collected",
      },
    }
  } catch (error) {
    context.error = { category: "control", message: errorMessage(error) }
    return {
      result: "local-rejected",
      exitCode: exitCodes.localRejected,
      reason: errorMessage(error),
      proof: {
        controlPlane: context.hello ? "observed" : "not-collected",
        hostApply: "not-collected",
        deviceRender: "not-collected",
      },
    }
  } finally {
    unsubscribe()
  }
}

function parseCommand(
  argv: readonly string[],
  runId: string,
): ParsedCommand | string {
  const scenarioName = argv[0]
  const socketPath = flagValue(argv, "--socket")
  if (!socketPath) return "moonlight-runtime-watch requires --socket <path>"
  const timeoutMs = parsePositiveInt(
    flagValue(argv, "--timeout-ms") ?? String(DEFAULT_TIMEOUT_MS),
  )
  if (!timeoutMs)
    return "moonlight-runtime-watch requires a positive --timeout-ms"

  const artifactPath =
    flagValue(argv, "--artifact") ?? `${runtimeWatchArtifactPath}/${runId}.json`

  if (scenarioName === "probe") {
    return { scenario: { _tag: "probe" }, socketPath, artifactPath, timeoutMs }
  }

  if (scenarioName === "set-bitrate") {
    const bitrateKbps = parsePositiveInt(flagValue(argv, "--bitrate-kbps"))
    if (!bitrateKbps) return "set-bitrate requires --bitrate-kbps <kbps>"
    return {
      scenario: { _tag: "set-bitrate", bitrateKbps },
      socketPath,
      artifactPath,
      timeoutMs,
    }
  }

  if (scenarioName === "set-fps") {
    const fps = parsePositiveInt(flagValue(argv, "--fps"))
    if (!fps) return "set-fps requires --fps <fps>"
    return {
      scenario: { _tag: "set-fps", fps },
      socketPath,
      artifactPath,
      timeoutMs,
    }
  }

  if (scenarioName === "set-resolution") {
    const width = parsePositiveInt(flagValue(argv, "--width"))
    const height = parsePositiveInt(flagValue(argv, "--height"))
    if (!width) return "set-resolution requires --width <pixels>"
    if (!height) return "set-resolution requires --height <pixels>"
    return {
      scenario: { _tag: "set-resolution", width, height },
      socketPath,
      artifactPath,
      timeoutMs,
    }
  }

  if (scenarioName === "set-touch-bounds") {
    const x = parseNonNegativeInt(flagValue(argv, "--x"))
    const y = parseNonNegativeInt(flagValue(argv, "--y"))
    const w = parsePositiveInt(flagValue(argv, "--w"))
    const h = parsePositiveInt(flagValue(argv, "--h"))
    if (x === undefined || y === undefined || !w || !h) {
      return "set-touch-bounds requires --x <x> --y <y> --w <w> --h <h>"
    }
    return {
      scenario: { _tag: "set-touch-bounds", x, y, w, h },
      socketPath,
      artifactPath,
      timeoutMs,
    }
  }

  return "moonlight-runtime-watch scenario must be probe, set-bitrate, set-fps, set-resolution, or set-touch-bounds"
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  return value && value.length > 0 ? value : undefined
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

function parseNonNegativeInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return undefined
  return parsed
}

function validateMutation(
  scenario: MoonlightRuntimeWatchScenario,
  hello: MoonlightControlHelloResult,
): string | undefined {
  if (hello.authority !== "controller")
    return "control authority is observer-only"
  const command = extractScenarioCommand(scenario)
  if (!hello.capabilities.commands.includes(command)) {
    return `${command} is not advertised by the active Moonlight session`
  }
  return validateScenarioLimits(scenario, hello)
}

function validateScenarioLimits(
  scenario: MoonlightRuntimeWatchScenario,
  hello: MoonlightControlHelloResult,
): string | undefined {
  if (scenario._tag === "set-bitrate")
    return validateBitrateScenario(scenario, hello)
  if (scenario._tag === "set-fps") return validateFpsScenario(scenario, hello)
  if (scenario._tag === "set-touch-bounds") {
    return validateTouchBoundsScenario(scenario, hello)
  }
  return undefined
}

function validateBitrateScenario(
  scenario: Extract<
    MoonlightRuntimeWatchScenario,
    { readonly _tag: "set-bitrate" }
  >,
  hello: MoonlightControlHelloResult,
): string | undefined {
  const limits =
    hello.limits.bitrateKbps ?? MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps
  if (scenario.bitrateKbps < limits.min || scenario.bitrateKbps > limits.max) {
    return `bitrate ${scenario.bitrateKbps} is outside ${limits.min}-${limits.max}`
  }
  return undefined
}

function validateFpsScenario(
  scenario: Extract<
    MoonlightRuntimeWatchScenario,
    { readonly _tag: "set-fps" }
  >,
  hello: MoonlightControlHelloResult,
): string | undefined {
  const limits = hello.limits.fps ?? MOONLIGHT_CONTROL_PROTOCOL_LIMITS.fps
  if (scenario.fps < limits.min || scenario.fps > limits.max) {
    return `fps ${scenario.fps} is outside ${limits.min}-${limits.max}`
  }
  return undefined
}

function validateTouchBoundsScenario(
  scenario: Extract<
    MoonlightRuntimeWatchScenario,
    { readonly _tag: "set-touch-bounds" }
  >,
  hello: MoonlightControlHelloResult,
): string | undefined {
  const limits =
    hello.limits.touchBounds ?? MOONLIGHT_CONTROL_PROTOCOL_LIMITS.touchBounds
  const checks = [
    ["x", scenario.x, limits.x],
    ["y", scenario.y, limits.y],
    ["w", scenario.w, limits.w],
    ["h", scenario.h, limits.h],
  ] as const
  for (const [axis, value, axisLimits] of checks) {
    if (value < axisLimits.min || value > axisLimits.max) {
      return `touch ${axis} ${value} is outside ${axisLimits.min}-${axisLimits.max}`
    }
  }
  return undefined
}

function sendMutation(
  client: MoonlightControlClient,
  scenario: MoonlightRuntimeWatchScenario,
): Promise<MoonlightControlSuccessResponse> {
  if (scenario._tag === "set-bitrate") {
    return client.setBitrate({ bitrateKbps: scenario.bitrateKbps })
  }
  if (scenario._tag === "set-fps") return client.setFps({ fps: scenario.fps })
  if (scenario._tag === "set-resolution") {
    return client.setResolution({
      width: scenario.width,
      height: scenario.height,
    })
  }
  if (scenario._tag === "set-touch-bounds") {
    return client.setTouchBounds({
      x: scenario.x,
      y: scenario.y,
      w: scenario.w,
      h: scenario.h,
    })
  }
  throw new Error("probe has no mutation command")
}

function extractScenarioCommand(
  scenario: MoonlightRuntimeWatchScenario,
): MoonlightControlAnyCommandMethod {
  if (scenario._tag === "set-bitrate") return "runtime.setBitrate"
  if (scenario._tag === "set-fps") return "runtime.setFps"
  if (scenario._tag === "set-resolution") return "runtime.setResolution"
  if (scenario._tag === "set-touch-bounds") return "input.setTouchBounds"
  return "runtime.requestIdr"
}

function extractCommandRequestId(
  result: MoonlightControlResponseResult,
): string | number {
  if (
    result._tag === "command.accepted" ||
    result._tag === "command.result" ||
    result._tag === "input.command.accepted" ||
    result._tag === "input.command.result"
  ) {
    return result.requestId
  }
  throw new Error("command did not return command result metadata")
}

function waitForCommandResult(options: {
  readonly client: MoonlightControlClient
  readonly observedEvents: readonly MoonlightControlEventDelivery[]
  readonly requestId: string
  readonly timeoutMs: number
}): Promise<CommandResultLike | undefined> {
  return new Promise(resolve => {
    const unsubscribe = options.client.onEvent(delivery => {
      const match = eventToCommandResult(delivery, options.requestId)
      if (!match) return
      clearTimeout(timeout)
      unsubscribe()
      resolve(match)
    })
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve(
        findMatchingCommandEvent(options.observedEvents, options.requestId),
      )
    }, options.timeoutMs)
  })
}

function findMatchingCommandEvent(
  events: readonly MoonlightControlEventDelivery[],
  requestId: string,
): CommandResultLike | undefined {
  for (const delivery of events) {
    const match = eventToCommandResult(delivery, requestId)
    if (match) return match
  }
  return undefined
}

interface CommandResultLike {
  readonly _tag: "command.result" | "input.command.result"
  readonly requestId: string | number
  readonly command: MoonlightControlAnyCommandMethod
  readonly status: string
}

function eventToCommandResult(
  delivery: MoonlightControlEventDelivery,
  requestId: string,
): CommandResultLike | undefined {
  const event = delivery.event
  if (
    "_tag" in event ||
    (event.name !== "runtime.commandResult" &&
      event.name !== "input.commandResult")
  ) {
    return undefined
  }
  if (String(event.requestId) !== requestId) return undefined
  return {
    _tag:
      event.name === "input.commandResult"
        ? "input.command.result"
        : "command.result",
    requestId: event.requestId,
    command: event.command,
    status: event.status,
  }
}

function classifyCommandResult(options: {
  readonly result: CommandResultLike
  readonly scenario: MoonlightRuntimeWatchScenario
  readonly postSnapshot: MoonlightControlStateSnapshotResult
}): TerminalClassification {
  const { result, scenario, postSnapshot } = options
  if (result.status === "applied") {
    if (
      result.command !== "input.setTouchBounds" &&
      !appliedStateMatchesScenario(scenario, postSnapshot)
    ) {
      return {
        result: "host-rejected",
        exitCode: exitCodes.hostRejected,
        reason: "applied state did not match requested setting",
        proof: {
          controlPlane: "observed",
          hostApply: "rejected",
          deviceRender: "not-collected",
        },
      }
    }
    return {
      result: "applied",
      exitCode: exitCodes.success,
      proof: {
        controlPlane: "observed",
        hostApply:
          result.command === "input.setTouchBounds"
            ? "not-collected"
            : "reported",
        deviceRender: "not-collected",
      },
    }
  }
  if (result.status === "accepted") {
    return {
      result: "sent-no-terminal-outcome",
      exitCode: exitCodes.sentNoTerminalOutcome,
      reason:
        "command remained accepted without terminal applied/rejected status",
      proof: {
        controlPlane: "observed",
        hostApply: "not-collected",
        deviceRender: "not-collected",
      },
    }
  }
  return {
    result:
      result.command === "input.setTouchBounds"
        ? "local-rejected"
        : "host-rejected",
    exitCode:
      result.command === "input.setTouchBounds"
        ? exitCodes.localRejected
        : exitCodes.hostRejected,
    reason: result.status,
    proof: {
      controlPlane: "observed",
      hostApply:
        result.command === "input.setTouchBounds"
          ? "not-collected"
          : "rejected",
      deviceRender: "not-collected",
    },
  }
}

function appliedStateMatchesScenario(
  scenario: MoonlightRuntimeWatchScenario,
  snapshot: MoonlightControlStateSnapshotResult,
): boolean {
  if (scenario._tag === "set-bitrate") {
    return snapshot.runtimeSettings.appliedBitrateKbps === scenario.bitrateKbps
  }
  if (scenario._tag === "set-fps") {
    return snapshot.runtimeSettings.appliedFps === scenario.fps
  }
  if (scenario._tag === "set-resolution") {
    return (
      snapshot.runtimeSettings.appliedResolution?.width === scenario.width &&
      snapshot.runtimeSettings.appliedResolution.height === scenario.height
    )
  }
  return false
}

async function writeArtifactAndSummary(options: {
  readonly context: WatchContext
  readonly terminal: TerminalClassification
  readonly completedAt: Date
  readonly writeArtifact: (path: string, content: string) => Promise<void>
  readonly write: (line: string) => void
}): Promise<number> {
  const artifact = buildArtifact(
    options.context,
    options.terminal,
    options.completedAt,
  )

  try {
    await options.writeArtifact(
      options.context.artifactPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
    )
  } catch {
    const exitCode = exitCodes.artifactWriteFailed
    options.write(
      JSON.stringify({
        terminalResult: "artifact-write-failed",
        exitCode,
        artifactPath: options.context.artifactPath,
      }),
    )
    return exitCode
  }

  options.write(
    JSON.stringify({
      terminalResult: options.terminal.result,
      exitCode: options.terminal.exitCode,
      artifactPath: options.context.artifactPath,
    }),
  )
  return options.terminal.exitCode
}

function buildArtifact(
  context: WatchContext,
  terminal: TerminalClassification,
  completedAt: Date,
): MoonlightRuntimeWatchArtifact {
  const durationMs = Math.max(
    0,
    completedAt.getTime() - context.startedAt.getTime(),
  )
  return {
    schema: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
    version: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
    run: {
      id: context.runId,
      startedAt: context.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
    },
    socket: {
      path: context.socketPath,
      attached: terminal.result !== "attach-failed",
    },
    scenario: context.scenario,
    hello: context.hello,
    preSnapshot: context.preSnapshot,
    postSnapshot: context.postSnapshot,
    subscription: context.subscription,
    commandResponse: context.commandResponse,
    observedEvents: context.observedEvents.map(delivery => ({
      seq: delivery.seq,
      event: delivery.event,
    })),
    sequenceGaps: context.sequenceGaps,
    proof: terminal.proof,
    terminal: {
      result: terminal.result,
      exitCode: terminal.exitCode,
      reason: terminal.reason,
    },
    error: context.error,
  }
}

async function writeArtifactFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}

function expectHello(
  response: MoonlightControlSuccessResponse,
): MoonlightControlHelloResult {
  if (response.result._tag !== "protocol.hello") {
    throw new Error(`expected protocol.hello, got ${response.result._tag}`)
  }
  return response.result
}

function expectStateSnapshot(
  response: MoonlightControlSuccessResponse,
): MoonlightControlStateSnapshotResult {
  if (response.result._tag !== "state.snapshot") {
    throw new Error(`expected state.snapshot, got ${response.result._tag}`)
  }
  return response.result
}

function expectSubscription(
  response: MoonlightControlSuccessResponse,
): MoonlightControlEventsSubscribedResult {
  if (response.result._tag !== "events.subscribed") {
    throw new Error(`expected events.subscribed, got ${response.result._tag}`)
  }
  return response.result
}

function notCollectedProof(): MoonlightRuntimeWatchProof {
  return {
    controlPlane: "not-collected",
    hostApply: "not-collected",
    deviceRender: "not-collected",
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

if (import.meta.main) {
  runMoonlightRuntimeWatchCommand(Bun.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode
  })
}
