import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { DataError, ValidationError } from "@shared/api/rpc/errors"
import {
  connectGamescopeControl,
  type GamescopeControlClient,
} from "@shared/gamescope-control/gamescope-control-client"
import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@shared/stream/moonlight-control-client"
import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "@shared/stream/moonlight-control-protocol"
import { Context, Effect, Layer } from "effect"
import {
  createDeviceControlService,
  type DeviceControlService,
} from "./device-control-service"
import type {
  StreamControlCommandResponseData,
  StreamControlConfigResponseData,
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
            client.setMode(payload),
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
            client.requestCommand("fps.set", payload),
          ),
        ),
      ),
    setGamescopeFilter: payload =>
      runGamescope(runtime, "gamescope.filter", payload, client =>
        client.setFilter(payload),
      ),
    setGamescopeSharpness: payload =>
      range("sharpness", payload.sharpness, 0, 20).pipe(
        Effect.flatMap(() =>
          runGamescope(runtime, "gamescope.sharpness", payload, client =>
            client.setSharpness(payload),
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
  const artifactDir = options.artifactDir
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
  let artifactDirReady: Promise<unknown> | undefined

  return {
    options,
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
    connectGamescope:
      deps.connectGamescope ??
      ((socketPath: string) => connectGamescopeControl({ socketPath })),
    deviceControl,
    record: async event => {
      if (!artifactDir) return
      artifactDirReady ??= mkdirImpl(artifactDir, { recursive: true }).catch(
        error => {
          artifactDirReady = undefined
          throw error
        },
      )
      await artifactDirReady
      await appendFileImpl(
        join(artifactDir, "events.jsonl"),
        `${JSON.stringify({ ts: now().toISOString(), ...asRecord(event) })}\n`,
      )
    },
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
        runLinkedGamescope(runtime, client =>
          client.requestCommand("fps.set", payload),
        ),
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
      run: () => runLinkedGamescope(runtime, client => client.setMode(payload)),
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
  const result = { action: input.action, requested: input.requested, response }
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

async function recordStateSnapshot(
  record: (event: unknown) => Promise<void>,
  result: StreamControlStateResponseData,
): Promise<void> {
  try {
    await record({ action: "state.snapshot", ...result })
  } catch {
    return
  }
}

async function readControlState<TClient, TReadback>(
  socketPath: string | undefined,
  connect: (socketPath: string) => Promise<TClient>,
  snapshot: (client: TClient) => Promise<unknown>,
  normalize: (snapshot: unknown) => TReadback,
) {
  if (!socketPath) return { status: "disabled" as const }
  let client: TClient | undefined
  try {
    client = await connect(socketPath)
    return {
      status: "ok" as const,
      readback: normalize(await snapshot(client)),
    }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  } finally {
    closeClient(client)
  }
}

function normalizeMoonlightState(snapshot: unknown) {
  const result = rpcResult(snapshot)
  const runtimeSettings = recordField(result, "runtimeSettings")
  const streamQuality = recordField(result, "streamQuality")
  return {
    bitrateKbps: moonlightNumber(
      runtimeSettings,
      streamQuality,
      "appliedBitrateKbps",
      "bitrateKbps",
    ),
    fps: moonlightNumber(runtimeSettings, streamQuality, "appliedFps", "fps"),
    resolution: moonlightResolutionReadback(runtimeSettings, streamQuality),
  }
}

function moonlightNumber(
  runtimeSettings: Record<string, unknown> | undefined,
  streamQuality: Record<string, unknown> | undefined,
  runtimeKey: string,
  streamKey: string,
): number | null {
  return (
    firstNumber(runtimeSettings?.[runtimeKey], streamQuality?.[streamKey]) ??
    null
  )
}

function moonlightResolutionReadback(
  runtimeSettings: Record<string, unknown> | undefined,
  streamQuality: Record<string, unknown> | undefined,
) {
  const runtimeResolution = recordField(runtimeSettings, "appliedResolution")
  return resolutionReadback(
    firstNumber(runtimeResolution?.width, streamQuality?.width),
    firstNumber(runtimeResolution?.height, streamQuality?.height),
  )
}

function normalizeGamescopeState(snapshot: unknown) {
  const result = rpcResult(snapshot)
  const mode = recordField(result, "xwaylandMode")
  const filter = result?.filter
  return {
    fps: firstNumber(result?.fps) ?? null,
    resolution: resolutionReadback(
      firstNumber(mode?.width),
      firstNumber(mode?.height),
    ),
    sharpness: firstNumber(result?.sharpness) ?? null,
    filter: isGamescopeScalingFilter(filter) ? filter : null,
  }
}

function resolutionReadback(
  width: number | undefined,
  height: number | undefined,
): { readonly width: number; readonly height: number } | null {
  return width === undefined || height === undefined ? null : { width, height }
}

function rpcResult(response: unknown): Record<string, unknown> | undefined {
  if (!isRecord(response)) return undefined
  const result = response.result
  return isRecord(result) ? result : undefined
}

function recordField(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key]
  return isRecord(value) ? value : undefined
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number")
}

function isGamescopeScalingFilter(
  value: unknown,
): value is GamescopeScalingFilter {
  return (
    value === "linear" ||
    value === "nearest" ||
    value === "integer" ||
    value === "fsr" ||
    value === "nis"
  )
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

function closeClient(client: unknown): void {
  if (isRecord(client) && typeof client.close === "function") client.close()
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (isRecord(error) && typeof error.message === "string") return error.message
  return String(error)
}
