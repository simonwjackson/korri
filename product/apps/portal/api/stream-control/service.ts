import { appendFile, mkdir } from "node:fs/promises"
import { DataError, ValidationError } from "@platform/api/rpc/errors"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@platform/stream/moonlight-control-client"
import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "@platform/stream/moonlight-control-protocol"
import { streamControlCapabilities } from "@platform/stream-control/control-contract"
import {
  closeClient,
  createStreamControlEventRecorder,
  errorMessage,
  isRecord,
  readControlState,
  recordStateSnapshot,
} from "@platform/stream-control/runtime-support"
import {
  normalizeMoonlightState,
  rpcResult,
} from "@platform/stream-control/state-normalizer"
import type { GamescopeScalingFilter } from "@product/plugins/gamescope"
import {
  connectGamescopeControl,
  type GamescopeControlClient,
  normalizeGamescopeState,
  setGamescopeFilter,
  setGamescopeFps,
  setGamescopeMode,
  setGamescopeSharpness,
} from "@product/plugins/gamescope"
import { Context, Effect, Layer } from "effect"
import {
  createDeviceControlService,
  type DeviceControlService,
} from "./device-control-service"
import type {
  StreamControlCommandResponseData,
  StreamControlConfigResponseData,
  StreamControlControlsResponseData,
  StreamControlRequestedPayload,
  StreamControlStateResponseData,
} from "./rpc-schemas"

export interface StreamControlOptions {
  readonly moonlightSocketPath?: string
  readonly gamescopeSocketPath?: string
  readonly artifactDir?: string
  readonly backlightDir?: string
  readonly powerSupplyDir?: string
}

export interface StreamControlDependencies {
  readonly connectMoonlight?: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly connectGamescope?: (
    socketPath: string,
  ) => Promise<GamescopeControlClient>
  readonly appendFile?: (path: string, content: string) => Promise<void>
  readonly mkdir?: (
    path: string,
    options?: { readonly recursive?: boolean },
  ) => Promise<unknown>
  readonly readdir?: (path: string) => Promise<readonly string[]>
  readonly readFile?: (path: string, encoding: "utf8") => Promise<string>
  readonly writeFile?: (path: string, content: string) => Promise<void>
  readonly now?: () => Date
}

export interface StreamControlService {
  readonly config: () => Effect.Effect<StreamControlConfigResponseData>
  readonly controls: () => Effect.Effect<StreamControlControlsResponseData>
  readonly state: () => Effect.Effect<StreamControlStateResponseData>
  readonly setBrightness: (payload: {
    readonly percent: number
    readonly device?: string
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setMoonlightBitrate: (payload: {
    readonly bitrateKbps: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setMoonlightFps: (payload: {
    readonly fps: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setMoonlightResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setLinkedFps: (payload: {
    readonly fps: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setLinkedResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setGamescopeMode: (payload: {
    readonly width: number
    readonly height: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setGamescopeFps: (payload: {
    readonly fps: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setGamescopeFilter: (payload: {
    readonly filter: GamescopeScalingFilter
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
  readonly setGamescopeSharpness: (payload: {
    readonly sharpness: number
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
}

export class StreamControl extends Context.Service<
  StreamControl,
  StreamControlService
>()("StreamControl") {}

interface Runtime {
  readonly options: StreamControlOptions
  readonly connectMoonlight: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly connectGamescope: (
    socketPath: string,
  ) => Promise<GamescopeControlClient>
  readonly record: (event: unknown) => Promise<void>
  readonly deviceControl: DeviceControlService
}

function streamControlOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): StreamControlOptions {
  return {
    moonlightSocketPath: env.MOONLIGHT_LOCAL_CONTROL_SOCKET,
    gamescopeSocketPath: env.KORRI_GAMESCOPE_CONTROL_SOCKET,
    artifactDir:
      env.KORRI_EVIER_ARTIFACT_DIR ?? env.KORRI_CONTROL_BENCH_ARTIFACT_DIR,
    backlightDir: env.KORRI_BACKLIGHT_DIR ?? "/sys/class/backlight",
    powerSupplyDir: env.KORRI_POWER_SUPPLY_DIR ?? "/sys/class/power_supply",
  }
}

export function createStreamControlService(
  options: StreamControlOptions = streamControlOptionsFromEnv(),
  deps: StreamControlDependencies = {},
): StreamControlService {
  const runtime = createRuntime(options, deps)

  return {
    config: () => Effect.succeed(configPayload(runtime.options)),
    controls: () => Effect.succeed(controlsPayload(runtime.options)),
    state: () => Effect.promise(() => readState(runtime)),
    setBrightness: payload =>
      range("percent", payload.percent, 0, 100).pipe(
        Effect.flatMap(() => validateBacklightDeviceName(payload.device)),
        Effect.flatMap(() =>
          runBrightness(
            runtime,
            "brightness",
            payload,
            payload.percent,
            payload.device,
          ),
        ),
      ),
    setMoonlightBitrate: payload =>
      range(
        "bitrateKbps",
        payload.bitrateKbps,
        MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps.min,
        MOONLIGHT_CONTROL_PROTOCOL_LIMITS.bitrateKbps.max,
      ).pipe(
        Effect.flatMap(() =>
          runMoonlight(runtime, "moonlight.bitrate", payload, client =>
            client.setBitrate(payload),
          ),
        ),
      ),
    setMoonlightFps: payload =>
      range("fps", payload.fps, 30, 120).pipe(
        Effect.flatMap(() =>
          runMoonlight(runtime, "moonlight.fps", payload, client =>
            client.setFps(payload),
          ),
        ),
      ),
    setMoonlightResolution: payload =>
      moonlightResolution(payload).pipe(
        Effect.flatMap(() =>
          runMoonlight(runtime, "moonlight.resolution", payload, client =>
            client.setResolution(payload),
          ),
        ),
      ),
    setLinkedFps: payload =>
      range("fps", payload.fps, 30, 120).pipe(
        Effect.flatMap(() => runLinkedFps(runtime, payload)),
      ),
    setLinkedResolution: payload =>
      gamescopeResolution(payload).pipe(
        Effect.flatMap(() => runLinkedResolution(runtime, payload)),
      ),
    setGamescopeMode: payload =>
      gamescopeResolution(payload).pipe(
        Effect.flatMap(() =>
          runGamescope(runtime, "gamescope.mode", payload, client =>
            setGamescopeMode(client, payload),
          ),
        ),
      ),
    setGamescopeFps: payload =>
      // Gamescope's GAMESCOPE_FPS_LIMIT cardinal accepts 0..240 (0 disables
      // the limiter). The Effect schema RuntimeGamescopeFps already rejects
      // anything outside this range; the runtime range() guard exists so
      // that direct service callers get a typed ValidationError instead of
      // a Die.
      range("fps", payload.fps, 0, 240).pipe(
        Effect.flatMap(() =>
          runGamescope(runtime, "gamescope.fps", payload, client =>
            setGamescopeFps(client, payload),
          ),
        ),
      ),
    setGamescopeFilter: payload =>
      runGamescope(runtime, "gamescope.filter", payload, client =>
        setGamescopeFilter(client, payload),
      ),
    setGamescopeSharpness: payload =>
      range("sharpness", payload.sharpness, 0, 20).pipe(
        Effect.flatMap(() =>
          runGamescope(runtime, "gamescope.sharpness", payload, client =>
            setGamescopeSharpness(client, payload),
          ),
        ),
      ),
  }
}

export const StreamControlLayerLive = Layer.sync(StreamControl)(() =>
  createStreamControlService(),
)

function createRuntime(
  options: StreamControlOptions,
  deps: StreamControlDependencies,
): Runtime {
  const now = deps.now ?? (() => new Date())
  const mkdirImpl = deps.mkdir ?? mkdir
  const appendFileImpl = deps.appendFile ?? appendFile
  const deviceControl = createDeviceControlService(
    {
      backlightDir: options.backlightDir,
      powerSupplyDir: options.powerSupplyDir,
    },
    {
      readdir: deps.readdir,
      readFile: deps.readFile,
      writeFile: deps.writeFile,
    },
  )

  return {
    options,
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
    connectGamescope:
      deps.connectGamescope ??
      ((socketPath: string) => connectGamescopeControl({ socketPath })),
    deviceControl,
    record: createStreamControlEventRecorder({
      artifactDir: options.artifactDir,
      mkdir: mkdirImpl,
      appendFile: appendFileImpl,
      now,
    }),
  }
}

function runMoonlight(
  runtime: Runtime,
  action: string,
  requested: StreamControlRequestedPayload,
  run: (client: MoonlightControlClient) => Promise<unknown>,
) {
  return runSocketAction({
    socketPath: runtime.options.moonlightSocketPath,
    disabledError: "moonlight socket disabled",
    connect: runtime.connectMoonlight,
    action,
    requested,
    record: runtime.record,
    run,
  })
}

function runGamescope(
  runtime: Runtime,
  action: string,
  requested: StreamControlRequestedPayload,
  run: (client: GamescopeControlClient) => Promise<unknown>,
) {
  return runSocketAction({
    socketPath: runtime.options.gamescopeSocketPath,
    disabledError: "gamescope socket disabled",
    connect: runtime.connectGamescope,
    action,
    requested,
    record: runtime.record,
    run,
  })
}

function runBrightness(
  runtime: Runtime,
  action: string,
  requested: StreamControlRequestedPayload,
  percent: number,
  device?: string,
): Effect.Effect<
  StreamControlCommandResponseData,
  DataError | ValidationError
> {
  return Effect.tryPromise({
    try: async () =>
      recordCommandOutcome(
        { action, requested, record: runtime.record },
        await runtime.deviceControl.setBacklightPercent(percent, device),
      ),
    catch: error =>
      new DataError({ reason: "Unavailable", message: errorMessage(error) }),
  })
}

function runLinkedFps(
  runtime: Runtime,
  payload: { readonly fps: number },
): Effect.Effect<
  StreamControlCommandResponseData,
  DataError | ValidationError
> {
  return runLinkedAction(runtime, "linked.fps", payload, [
    {
      key: "moonlight",
      run: () => runLinkedMoonlight(runtime, client => client.setFps(payload)),
    },
    {
      key: "gamescope",
      run: () =>
        runLinkedGamescope(runtime, client => setGamescopeFps(client, payload)),
    },
  ])
}

function runLinkedResolution(
  runtime: Runtime,
  payload: { readonly width: number; readonly height: number },
): Effect.Effect<
  StreamControlCommandResponseData,
  DataError | ValidationError
> {
  return runLinkedAction(runtime, "linked.resolution", payload, [
    {
      key: "gamescope",
      run: () =>
        runLinkedGamescope(runtime, client =>
          setGamescopeMode(client, payload),
        ),
    },
    {
      key: "moonlight",
      run: () =>
        runLinkedMoonlight(runtime, client => client.setResolution(payload)),
    },
  ])
}

function runLinkedAction(
  runtime: Runtime,
  action: string,
  requested: StreamControlRequestedPayload,
  targets: readonly {
    readonly key: "moonlight" | "gamescope"
    readonly run: () => Promise<LinkedTargetOutcome>
  }[],
): Effect.Effect<
  StreamControlCommandResponseData,
  DataError | ValidationError
> {
  return Effect.tryPromise({
    try: async () => {
      const entries: Array<
        readonly ["moonlight" | "gamescope", LinkedTargetOutcome]
      > = []
      for (const target of targets) {
        entries.push([target.key, await target.run()] as const)
      }
      const byKey = Object.fromEntries(entries)
      const response = {
        status: linkedOverallStatus(entries.map(([, outcome]) => outcome)),
        ...byKey,
      }
      return recordCommandOutcome(
        { action, requested, record: runtime.record },
        response,
      )
    },
    catch: error =>
      new DataError({ reason: "Unavailable", message: errorMessage(error) }),
  })
}

type LinkedTargetOutcome =
  | { readonly status: "applied"; readonly response: unknown }
  | { readonly status: "pending"; readonly response: unknown }
  | { readonly status: "failed"; readonly error: string }

type CommandTargetOutcomeData =
  | { readonly status: "applied" }
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly error: string }

type CommandOutcomeData =
  | { readonly kind: "single"; readonly status: "applied" }
  | { readonly kind: "single"; readonly status: "pending" }
  | {
      readonly kind: "single"
      readonly status: "failed"
      readonly error: string
    }
  | {
      readonly kind: "linked"
      readonly status: "applied" | "pending" | "partial" | "failed"
      readonly moonlight: CommandTargetOutcomeData
      readonly gamescope: CommandTargetOutcomeData
    }

async function runLinkedMoonlight(
  runtime: Runtime,
  run: (client: MoonlightControlClient) => Promise<unknown>,
): Promise<LinkedTargetOutcome> {
  return runLinkedSocketTarget(
    runtime.options.moonlightSocketPath,
    "moonlight socket disabled",
    runtime.connectMoonlight,
    run,
  )
}

async function runLinkedGamescope(
  runtime: Runtime,
  run: (client: GamescopeControlClient) => Promise<unknown>,
): Promise<LinkedTargetOutcome> {
  return runLinkedSocketTarget(
    runtime.options.gamescopeSocketPath,
    "gamescope socket disabled",
    runtime.connectGamescope,
    run,
  )
}

async function runLinkedSocketTarget<TClient>(
  socketPath: string | undefined,
  disabledError: string,
  connect: (socketPath: string) => Promise<TClient>,
  run: (client: TClient) => Promise<unknown>,
): Promise<LinkedTargetOutcome> {
  if (!socketPath) return { status: "failed", error: disabledError }
  let client: TClient | undefined
  try {
    client = await connect(socketPath)
    return commandTargetOutcome(await run(client))
  } catch (error) {
    return { status: "failed", error: errorMessage(error) }
  } finally {
    closeClient(client)
  }
}

function commandTargetOutcome(response: unknown): LinkedTargetOutcome {
  const result = rpcResult(response)
  if (result?._tag === "command.accepted")
    return { status: "pending", response }
  if (result?._tag !== "command.result") return { status: "applied", response }

  if (result.status === "applied") return { status: "applied", response }
  if (result.status === "accepted") return { status: "pending", response }
  return { status: "failed", error: commandFailureMessage(result) }
}

function commandFailureMessage(result: Record<string, unknown>): string {
  const status = typeof result.status === "string" ? result.status : "failed"
  const reason = typeof result.reason === "string" ? result.reason : undefined
  return reason ? `${status}: ${reason}` : status
}

function linkedOverallStatus(
  outcomes: readonly LinkedTargetOutcome[],
): "applied" | "pending" | "partial" | "failed" {
  const failures = outcomes.filter(outcome => outcome.status === "failed")
  if (failures.length === outcomes.length) return "failed"
  if (failures.length > 0) return "partial"
  return outcomes.some(outcome => outcome.status === "pending")
    ? "pending"
    : "applied"
}

function commandOutcome(response: unknown): CommandOutcomeData {
  const linked = linkedCommandOutcome(response)
  return linked ?? singleCommandOutcome(response)
}

function singleCommandOutcome(response: unknown): CommandOutcomeData {
  const target = commandTargetOutcome(response)
  return target.status === "failed"
    ? { kind: "single", status: "failed", error: target.error }
    : { kind: "single", status: target.status }
}

function linkedCommandOutcome(
  response: unknown,
): Extract<CommandOutcomeData, { readonly kind: "linked" }> | undefined {
  if (!isRecord(response)) return undefined
  const moonlight = targetOutcomeData(response.moonlight)
  const gamescope = targetOutcomeData(response.gamescope)
  if (!moonlight || !gamescope) return undefined
  const status = response.status
  return {
    kind: "linked",
    status:
      status === "applied" ||
      status === "pending" ||
      status === "partial" ||
      status === "failed"
        ? status
        : linkedOverallStatus([moonlight, gamescope]),
    moonlight,
    gamescope,
  }
}

function targetOutcomeData(
  value: unknown,
): (CommandTargetOutcomeData & LinkedTargetOutcome) | undefined {
  if (!isRecord(value)) return undefined
  if (value.status === "failed") {
    return {
      status: "failed",
      error: typeof value.error === "string" ? value.error : "failed",
    }
  }
  if (value.status === "pending") {
    return { status: "pending", response: value.response }
  }
  if (value.status === "applied") {
    return { status: "applied", response: value.response }
  }
  return undefined
}

function runSocketAction<TClient>(input: {
  readonly socketPath: string | undefined
  readonly disabledError: string
  readonly connect: (socketPath: string) => Promise<TClient>
  readonly action: string
  readonly requested: StreamControlRequestedPayload
  readonly record: (event: unknown) => Promise<void>
  readonly run: (client: TClient) => Promise<unknown>
}): Effect.Effect<
  StreamControlCommandResponseData,
  DataError | ValidationError
> {
  const socketPath = input.socketPath
  if (!socketPath) {
    return Effect.fail(
      new DataError({ reason: "Unavailable", message: input.disabledError }),
    )
  }

  return Effect.tryPromise({
    try: async () => {
      let client: TClient | undefined
      try {
        client = await input.connect(socketPath)
        return await recordCommandOutcome(input, await input.run(client))
      } finally {
        closeClient(client)
      }
    },
    catch: error =>
      new DataError({
        reason: "Unavailable",
        message: errorMessage(error),
      }),
  })
}

async function recordCommandOutcome(
  input: {
    readonly action: string
    readonly requested: StreamControlRequestedPayload
    readonly record: (event: unknown) => Promise<void>
  },
  response: unknown,
): Promise<StreamControlCommandResponseData> {
  const result = {
    action: input.action,
    requested: input.requested,
    outcome: commandOutcome(response),
    response,
  }
  try {
    await input.record(result)
    return result
  } catch (error) {
    return { ...result, diagnosticError: errorMessage(error) }
  }
}

async function readState(
  runtime: Runtime,
): Promise<StreamControlStateResponseData> {
  const [moonlight, gamescope, brightness, battery] = await Promise.all([
    readControlState(
      runtime.options.moonlightSocketPath,
      runtime.connectMoonlight,
      client => client.state(),
      normalizeMoonlightState,
    ),
    readControlState(
      runtime.options.gamescopeSocketPath,
      runtime.connectGamescope,
      client => client.state(),
      normalizeGamescopeState,
    ),
    readBrightnessState(runtime),
    readBatteryState(runtime),
  ])
  const result = { moonlight, gamescope, brightness, battery }
  await recordStateSnapshot(runtime.record, result)
  return result
}

async function readBrightnessState(runtime: Runtime) {
  try {
    return {
      status: "ok" as const,
      readback: await runtime.deviceControl.readBacklights(),
    }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  }
}

async function readBatteryState(runtime: Runtime) {
  try {
    return {
      status: "ok" as const,
      readback: await runtime.deviceControl.readBattery(),
    }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  }
}

function configPayload(
  options: StreamControlOptions,
): StreamControlConfigResponseData {
  return {
    moonlight: { enabled: Boolean(options.moonlightSocketPath) },
    gamescope: { enabled: Boolean(options.gamescopeSocketPath) },
    brightness: { enabled: true },
    battery: { enabled: true },
    artifactDir: options.artifactDir ?? null,
  }
}

function controlsPayload(
  options: StreamControlOptions,
): StreamControlControlsResponseData {
  return streamControlCapabilities({
    moonlight: Boolean(options.moonlightSocketPath),
    gamescope: Boolean(options.gamescopeSocketPath),
    brightness: true,
    battery: true,
  })
}

function range(
  label: string,
  value: number,
  min: number,
  max: number,
): Effect.Effect<void, ValidationError> {
  return Number.isFinite(value) && value >= min && value <= max
    ? Effect.void
    : Effect.fail(
        new ValidationError({
          message: `${label} between ${min} and ${max} required`,
        }),
      )
}

function moonlightResolution(payload: {
  readonly width: number
  readonly height: number
}): Effect.Effect<void, ValidationError> {
  return range(
    "width",
    payload.width,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.width.min,
    MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.width.max,
  ).pipe(
    Effect.andThen(
      range(
        "height",
        payload.height,
        MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.height.min,
        MOONLIGHT_CONTROL_PROTOCOL_LIMITS.resolution.height.max,
      ),
    ),
  )
}

function gamescopeResolution(payload: {
  readonly width: number
  readonly height: number
}): Effect.Effect<void, ValidationError> {
  return range("width", payload.width, 1, 16_384).pipe(
    Effect.andThen(range("height", payload.height, 1, 16_384)),
  )
}

function validateBacklightDeviceName(
  device: string | undefined,
): Effect.Effect<void, ValidationError> {
  if (device === undefined) return Effect.void
  return device.length > 0 && !device.includes("/") && !device.includes("..")
    ? Effect.void
    : Effect.fail(new ValidationError({ message: "invalid backlight device" }))
}
