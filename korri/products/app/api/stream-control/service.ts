import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
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
  readonly backlightDir: string
  readonly powerSupplyDir: string
  readonly readBacklights: () => Promise<BacklightSnapshot>
  readonly readBattery: () => Promise<BatterySnapshot>
  readonly setBacklightPercent: (
    percent: number,
    device?: string,
  ) => Promise<BacklightSetResult>
}

interface BacklightDeviceState {
  readonly name: string
  readonly brightness: number
  readonly maxBrightness: number
  readonly percent: number
}

interface BacklightSnapshot {
  readonly devices: readonly BacklightDeviceState[]
  readonly percent: number | null
}

interface BacklightSetResult extends BacklightSnapshot {
  readonly requestedPercent: number
  readonly requestedDevice?: string
}

interface PowerSupplyState {
  readonly name: string
  readonly type: string | null
  readonly status: string | null
  readonly capacity: number | null
  readonly online: boolean | null
  readonly voltageNow: number | null
  readonly currentNow: number | null
  readonly powerNow: number | null
  readonly modelName: string | null
}

interface BatterySnapshot {
  readonly percent: number | null
  readonly status: string | null
  readonly supplies: readonly PowerSupplyState[]
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
          runBrightness(runtime, "brightness", payload, payload.percent, payload.device),
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
  const readdirImpl = deps.readdir ?? readdir
  const readFileImpl = deps.readFile ?? readFile
  const writeFileImpl = deps.writeFile ?? writeFile
  const artifactDir = options.artifactDir
  const backlightDir = options.backlightDir ?? "/sys/class/backlight"
  const powerSupplyDir = options.powerSupplyDir ?? "/sys/class/power_supply"
  let artifactDirReady: Promise<unknown> | undefined

  return {
    options,
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
    connectGamescope:
      deps.connectGamescope ??
      ((socketPath: string) => connectGamescopeControl({ socketPath })),
    backlightDir,
    powerSupplyDir,
    readBacklights: () =>
      readBacklightSnapshot(backlightDir, readdirImpl, readFileImpl),
    readBattery: () =>
      readBatterySnapshot(powerSupplyDir, readdirImpl, readFileImpl),
    setBacklightPercent: (percent, device) =>
      writeBacklightPercent(
        backlightDir,
        percent,
        device,
        readdirImpl,
        readFileImpl,
        writeFileImpl,
      ),
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
        await runtime.setBacklightPercent(percent, device),
      ),
    catch: error =>
      new DataError({ reason: "Unavailable", message: errorMessage(error) }),
  })
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
    ),
    readControlState(
      runtime.options.gamescopeSocketPath,
      runtime.connectGamescope,
      client => client.state(),
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

async function readControlState<TClient>(
  socketPath: string | undefined,
  connect: (socketPath: string) => Promise<TClient>,
  snapshot: (client: TClient) => Promise<unknown>,
) {
  if (!socketPath) return { status: "disabled" as const }
  let client: TClient | undefined
  try {
    client = await connect(socketPath)
    return { status: "ok" as const, response: await snapshot(client) }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  } finally {
    closeClient(client)
  }
}

async function readBrightnessState(runtime: Runtime) {
  try {
    return { status: "ok" as const, response: await runtime.readBacklights() }
  } catch (error) {
    return { status: "error" as const, error: errorMessage(error) }
  }
}

async function readBatteryState(runtime: Runtime) {
  try {
    return { status: "ok" as const, response: await runtime.readBattery() }
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

async function writeBacklightPercent(
  dir: string,
  percent: number,
  device: string | undefined,
  readdirImpl: (path: string) => Promise<readonly string[]>,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
  writeFileImpl: (path: string, content: string) => Promise<void>,
): Promise<BacklightSetResult> {
  const devices = await listBacklightDeviceNames(dir, readdirImpl)
  if (devices.length === 0) throw new Error(`no backlight devices in ${dir}`)
  const targets = device ? [device] : devices
  for (const name of targets) {
    if (!devices.includes(name)) throw new Error(`unknown backlight device ${name}`)
    const maxBrightness = await readPositiveInteger(
      join(dir, name, "max_brightness"),
      readFileImpl,
    )
    const brightness = Math.round((maxBrightness * percent) / 100)
    await writeFileImpl(join(dir, name, "brightness"), `${brightness}\n`)
  }
  return {
    requestedPercent: percent,
    ...(device ? { requestedDevice: device } : {}),
    ...(await readBacklightSnapshot(dir, readdirImpl, readFileImpl)),
  }
}

async function readBacklightSnapshot(
  dir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<BacklightSnapshot> {
  const names = await listBacklightDeviceNames(dir, readdirImpl)
  if (names.length === 0) throw new Error(`no backlight devices in ${dir}`)
  const devices = await Promise.all(
    names.map(async name => {
      const [brightness, maxBrightness] = await Promise.all([
        readNonNegativeInteger(join(dir, name, "brightness"), readFileImpl),
        readPositiveInteger(join(dir, name, "max_brightness"), readFileImpl),
      ])
      return {
        name,
        brightness,
        maxBrightness,
        percent: Math.round((brightness * 100) / maxBrightness),
      }
    }),
  )
  return {
    devices,
    percent:
      devices.length === 0
        ? null
        : Math.round(
            devices.reduce((sum, device) => sum + device.percent, 0) /
              devices.length,
          ),
  }
}

async function listBacklightDeviceNames(
  dir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
): Promise<readonly string[]> {
  return (await readdirImpl(dir)).filter(name => !name.includes("/"))
}

async function readBatterySnapshot(
  dir: string,
  readdirImpl: (path: string) => Promise<readonly string[]>,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<BatterySnapshot> {
  const names = (await readdirImpl(dir)).filter(name => !name.includes("/"))
  if (names.length === 0) throw new Error(`no power supplies in ${dir}`)
  const supplies = await Promise.all(
    names.map(async name => readPowerSupply(dir, name, readFileImpl)),
  )
  const batteries = supplies.filter(supply => supply.type === "Battery")
  const primary = batteries.find(supply => supply.capacity !== null) ?? batteries[0]
  return {
    percent: primary?.capacity ?? null,
    status: primary?.status ?? null,
    supplies,
  }
}

async function readPowerSupply(
  dir: string,
  name: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<PowerSupplyState> {
  const readOptional = (file: string) =>
    readOptionalText(join(dir, name, file), readFileImpl)
  const [
    type,
    status,
    capacity,
    online,
    voltageNow,
    currentNow,
    powerNow,
    modelName,
  ] = await Promise.all([
    readOptional("type"),
    readOptional("status"),
    readOptionalInteger(join(dir, name, "capacity"), readFileImpl),
    readOptionalInteger(join(dir, name, "online"), readFileImpl),
    readOptionalInteger(join(dir, name, "voltage_now"), readFileImpl),
    readOptionalInteger(join(dir, name, "current_now"), readFileImpl),
    readOptionalInteger(join(dir, name, "power_now"), readFileImpl),
    readOptional("model_name"),
  ])
  return {
    name,
    type,
    status,
    capacity,
    online: online === null ? null : online !== 0,
    voltageNow,
    currentNow,
    powerNow,
    modelName,
  }
}

async function readOptionalText(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<string | null> {
  try {
    const text = (await readFileImpl(path, "utf8")).trim()
    return text.length === 0 ? null : text
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function readOptionalInteger(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number | null> {
  const text = await readOptionalText(path, readFileImpl)
  if (text === null) return null
  const value = Number.parseInt(text, 10)
  return Number.isInteger(value) ? value : null
}

async function readPositiveInteger(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number> {
  const value = await readNonNegativeInteger(path, readFileImpl)
  if (value <= 0) throw new Error(`${path} must be > 0`)
  return value
}

async function readNonNegativeInteger(
  path: string,
  readFileImpl: (path: string, encoding: "utf8") => Promise<string>,
): Promise<number> {
  const value = Number.parseInt((await readFileImpl(path, "utf8")).trim(), 10)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} is not a non-negative integer`)
  }
  return value
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
