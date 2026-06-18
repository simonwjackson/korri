import { appendFile, mkdir } from "node:fs/promises"
import { DataError, ValidationError } from "@platform/api/rpc/errors"
import {
  type KorriPlugin,
  type PluginHandler,
  type ProviderId,
  parsePluginRecordId,
  runPluginHandler,
} from "@platform/plugin"
import {
  createPluginRegistry,
  type PluginRegistry,
} from "@platform/plugin/registry"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@platform/stream/moonlight-control-client"
import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "@platform/stream/moonlight-control-protocol"
import {
  type StreamControlCapability,
  streamControlCapabilities,
} from "@platform/stream-control/control-contract"
import {
  closeClient,
  createStreamControlEventRecorder,
  errorMessage,
  readControlState,
  recordStateSnapshot,
} from "@platform/stream-control/runtime-support"
import {
  normalizeMoonlightState,
  rpcResult,
} from "@platform/stream-control/state-normalizer"
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
  readonly artifactDir?: string
  readonly backlightDir?: string
  readonly powerSupplyDir?: string
}

export interface StreamControlDependencies {
  readonly pluginRegistry?: PluginRegistry
  readonly connectMoonlight?: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
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
  readonly applyAction: (payload: {
    readonly action: string
    readonly payload: StreamControlRequestedPayload
  }) => Effect.Effect<
    StreamControlCommandResponseData,
    DataError | ValidationError
  >
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
}

export class StreamControl extends Context.Service<
  StreamControl,
  StreamControlService
>()("StreamControl") {}

interface Runtime {
  readonly options: StreamControlOptions
  readonly pluginRegistry: PluginRegistry
  readonly connectMoonlight: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly record: (event: unknown) => Promise<void>
  readonly deviceControl: DeviceControlService
}

interface PluginStreamControlDescription {
  readonly config?: { readonly enabled: boolean }
  readonly controls?: readonly StreamControlCapability[]
  readonly state?: unknown
}

function streamControlOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): StreamControlOptions {
  return {
    moonlightSocketPath: env.MOONLIGHT_LOCAL_CONTROL_SOCKET,
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
    config: () => Effect.promise(() => configPayload(runtime)),
    controls: () => Effect.promise(() => controlsPayload(runtime)),
    state: () => Effect.promise(() => readState(runtime)),
    applyAction: payload =>
      applyAction(runtime, payload.action, payload.payload),
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
  }
}

export const StreamControlLayerLive = Layer.sync(StreamControl)(() =>
  createStreamControlService(),
)

export const StreamControlLayerLiveWithPlugins = (
  pluginRegistry: PluginRegistry,
) =>
  Layer.sync(StreamControl)(() =>
    createStreamControlService(undefined, { pluginRegistry }),
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
    pluginRegistry: deps.pluginRegistry ?? createPluginRegistry([]),
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
    deviceControl,
    record: createStreamControlEventRecorder({
      artifactDir: options.artifactDir,
      mkdir: mkdirImpl,
      appendFile: appendFileImpl,
      now,
    }),
  }
}

function applyAction(
  runtime: Runtime,
  action: string,
  requested: StreamControlRequestedPayload,
): Effect.Effect<
  StreamControlCommandResponseData,
  DataError | ValidationError
> {
  if (action === "app.stream-control.brightness.set") {
    return numericPayloadField(requested, "percent").pipe(
      Effect.flatMap(percent =>
        range("percent", percent, 0, 100).pipe(Effect.as(percent)),
      ),
      Effect.flatMap(percent =>
        runBrightness(
          runtime,
          "brightness",
          requested,
          percent,
          typeof requested.device === "string" ? requested.device : undefined,
        ),
      ),
    )
  }
  if (action === "app.stream-control.moonlight-bitrate.set") {
    return numericPayloadField(requested, "bitrateKbps").pipe(
      Effect.flatMap(bitrateKbps =>
        createStreamControlService(runtime.options, {
          pluginRegistry: runtime.pluginRegistry,
          connectMoonlight: runtime.connectMoonlight,
        }).setMoonlightBitrate({ bitrateKbps }),
      ),
    )
  }
  if (action === "app.stream-control.moonlight-fps.set") {
    return numericPayloadField(requested, "fps").pipe(
      Effect.flatMap(fps =>
        createStreamControlService(runtime.options, {
          pluginRegistry: runtime.pluginRegistry,
          connectMoonlight: runtime.connectMoonlight,
        }).setMoonlightFps({ fps }),
      ),
    )
  }
  if (action === "app.stream-control.moonlight-resolution.set") {
    return numericPayloadField(requested, "width").pipe(
      Effect.bindTo("width"),
      Effect.bind("height", () => numericPayloadField(requested, "height")),
      Effect.flatMap(({ width, height }) =>
        createStreamControlService(runtime.options, {
          pluginRegistry: runtime.pluginRegistry,
          connectMoonlight: runtime.connectMoonlight,
        }).setMoonlightResolution({ width, height }),
      ),
    )
  }

  const ref = parsePluginRecordId(action)
  if (!ref) {
    return Effect.fail(
      new DataError({ reason: "Unavailable", message: "unsupported action" }),
    )
  }

  const plugin = runtime.pluginRegistry.get(ref.provider)
  if (!plugin || !runtime.pluginRegistry.enabledPluginIds.has(ref.provider)) {
    return Effect.fail(
      new DataError({ reason: "Unavailable", message: "provider disabled" }),
    )
  }

  const handler = streamControlHandler(plugin, "stream-control.apply")
  if (!handler) {
    return Effect.fail(
      new DataError({ reason: "Unavailable", message: "action unsupported" }),
    )
  }

  return runPluginHandler(handler, {
    operation: "stream-control.apply",
    provider: ref.provider,
    input: { action, payload: requested },
  }).pipe(
    Effect.map(response =>
      recordCommandOutcome(
        { action, requested, record: runtime.record },
        response,
      ),
    ),
    Effect.flatMap(response => Effect.promise(() => response)),
    Effect.mapError(
      error =>
        new DataError({ reason: "Unavailable", message: errorMessage(error) }),
    ),
  )
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

type CommandTargetOutcome =
  | { readonly status: "applied"; readonly response: unknown }
  | { readonly status: "pending"; readonly response: unknown }
  | { readonly status: "failed"; readonly error: string }

type CommandOutcomeData =
  | { readonly kind: "single"; readonly status: "applied" }
  | { readonly kind: "single"; readonly status: "pending" }
  | {
      readonly kind: "single"
      readonly status: "failed"
      readonly error: string
    }

function commandTargetOutcome(response: unknown): CommandTargetOutcome {
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

function commandOutcome(response: unknown): CommandOutcomeData {
  const target = commandTargetOutcome(response)
  return target.status === "failed"
    ? { kind: "single", status: "failed", error: target.error }
    : { kind: "single", status: target.status }
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
  const [moonlight, brightness, battery, pluginDescriptions] =
    await Promise.all([
      readControlState(
        runtime.options.moonlightSocketPath,
        runtime.connectMoonlight,
        client => client.state(),
        normalizeMoonlightState,
      ),
      readBrightnessState(runtime),
      readBatteryState(runtime),
      describePluginStreamControls(runtime),
    ])
  const result = {
    moonlight,
    brightness,
    battery,
    plugins: Object.fromEntries(
      pluginDescriptions.map(description => [
        description.provider,
        description.description.state ?? { status: "disabled" },
      ]),
    ) as StreamControlStateResponseData["plugins"],
  }
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

async function configPayload(
  runtime: Runtime,
): Promise<StreamControlConfigResponseData> {
  const pluginDescriptions = await describePluginStreamControls(runtime)
  return {
    moonlight: { enabled: Boolean(runtime.options.moonlightSocketPath) },
    brightness: { enabled: true },
    battery: { enabled: true },
    plugins: Object.fromEntries(
      pluginDescriptions.map(description => [
        description.provider,
        description.description.config ?? { enabled: false },
      ]),
    ),
    artifactDir: runtime.options.artifactDir ?? null,
  }
}

async function controlsPayload(
  runtime: Runtime,
): Promise<StreamControlControlsResponseData> {
  const pluginControls = (await describePluginStreamControls(runtime)).flatMap(
    description => description.description.controls ?? [],
  )
  return streamControlCapabilities(
    {
      moonlight: Boolean(runtime.options.moonlightSocketPath),
      brightness: true,
      battery: true,
    },
    pluginControls,
  )
}

async function describePluginStreamControls(runtime: Runtime): Promise<
  readonly {
    readonly provider: ProviderId
    readonly description: PluginStreamControlDescription
  }[]
> {
  const descriptions = []
  for (const plugin of runtime.pluginRegistry.enabledPlugins) {
    const handler = streamControlHandler(plugin, "stream-control.describe")
    if (!handler) continue
    try {
      const description = await Effect.runPromise(
        runPluginHandler(handler, {
          operation: "stream-control.describe",
          provider: plugin.id,
          input: {},
        }) as Effect.Effect<PluginStreamControlDescription, unknown>,
      )
      descriptions.push({ provider: plugin.id, description })
    } catch (error) {
      descriptions.push({
        provider: plugin.id,
        description: {
          config: { enabled: false },
          state: { status: "error", error: errorMessage(error) },
          controls: [],
        },
      })
    }
  }
  return descriptions
}

function streamControlHandler(
  plugin: KorriPlugin,
  operation: "stream-control.describe" | "stream-control.apply",
): PluginHandler | undefined {
  return plugin.handlers.find(handler => handler.operation === operation)
}

function numericPayloadField(
  payload: StreamControlRequestedPayload,
  key: string,
): Effect.Effect<number, ValidationError> {
  const value = payload[key]
  return typeof value === "number" && Number.isFinite(value)
    ? Effect.succeed(value)
    : Effect.fail(new ValidationError({ message: `${key} number required` }))
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

function validateBacklightDeviceName(
  device: string | undefined,
): Effect.Effect<void, ValidationError> {
  if (device === undefined) return Effect.void
  return device.length > 0 && !device.includes("/") && !device.includes("..")
    ? Effect.void
    : Effect.fail(new ValidationError({ message: "invalid backlight device" }))
}
