import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { DataError } from "@shared/api/rpc/errors"
import {
  connectGamescopeControl,
  type GamescopeControlClient,
} from "@shared/gamescope-control/gamescope-control-client"
import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@shared/stream/moonlight-control-client"
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
  readonly now?: () => Date
}

export interface StreamControlService {
  readonly config: () => Effect.Effect<StreamControlConfigResponseData>
  readonly state: () => Effect.Effect<StreamControlStateResponseData>
  readonly setMoonlightBitrate: (payload: {
    readonly bitrateKbps: number
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
  readonly setMoonlightFps: (payload: {
    readonly fps: number
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
  readonly setMoonlightResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
  readonly setGamescopeMode: (payload: {
    readonly width: number
    readonly height: number
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
  readonly setGamescopeFps: (payload: {
    readonly fps: number
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
  readonly setGamescopeFilter: (payload: {
    readonly filter: GamescopeScalingFilter
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
  readonly setGamescopeSharpness: (payload: {
    readonly sharpness: number
  }) => Effect.Effect<StreamControlCommandResponseData, DataError>
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
}

function streamControlOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): StreamControlOptions {
  return {
    moonlightSocketPath: env.MOONLIGHT_LOCAL_CONTROL_SOCKET,
    gamescopeSocketPath: env.KORRI_GAMESCOPE_CONTROL_SOCKET,
    artifactDir:
      env.KORRI_EVIER_ARTIFACT_DIR ?? env.KORRI_CONTROL_BENCH_ARTIFACT_DIR,
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
    setMoonlightBitrate: payload =>
      positive("bitrateKbps", payload.bitrateKbps, 100_000).pipe(
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
      positiveResolution(payload).pipe(
        Effect.flatMap(() =>
          runMoonlight(runtime, "moonlight.resolution", payload, client =>
            client.setResolution(payload),
          ),
        ),
      ),
    setGamescopeMode: payload =>
      positiveResolution(payload).pipe(
        Effect.flatMap(() =>
          runGamescope(runtime, "gamescope.mode", payload, client =>
            client.setMode(payload),
          ),
        ),
      ),
    setGamescopeFps: payload =>
      range("fps", payload.fps, 30, 120).pipe(
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
  let artifactDirReady: Promise<unknown> | undefined

  return {
    options,
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
    connectGamescope:
      deps.connectGamescope ??
      ((socketPath: string) => connectGamescopeControl({ socketPath })),
    record: async event => {
      if (!artifactDir) return
      artifactDirReady ??= mkdirImpl(artifactDir, { recursive: true })
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

function runSocketAction<TClient>(input: {
  readonly socketPath: string | undefined
  readonly disabledError: string
  readonly connect: (socketPath: string) => Promise<TClient>
  readonly action: string
  readonly requested: StreamControlRequestedPayload
  readonly record: (event: unknown) => Promise<void>
  readonly run: (client: TClient) => Promise<unknown>
}): Effect.Effect<StreamControlCommandResponseData, DataError> {
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
  const [moonlight, gamescope] = await Promise.all([
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
  ])
  const result = { moonlight, gamescope }
  await runtime.record({ action: "state.snapshot", ...result })
  return result
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

function configPayload(
  options: StreamControlOptions,
): StreamControlConfigResponseData {
  return {
    moonlight: { enabled: Boolean(options.moonlightSocketPath) },
    gamescope: { enabled: Boolean(options.gamescopeSocketPath) },
    artifactDir: options.artifactDir ?? null,
  }
}

function positive(
  label: string,
  value: number,
  max: number,
): Effect.Effect<void, DataError> {
  return Number.isFinite(value) && value > 0 && value <= max
    ? Effect.void
    : Effect.fail(
        new DataError({
          reason: "Unavailable",
          message: `${label} greater than 0 and at most ${max} required`,
        }),
      )
}

function range(
  label: string,
  value: number,
  min: number,
  max: number,
): Effect.Effect<void, DataError> {
  return Number.isFinite(value) && value >= min && value <= max
    ? Effect.void
    : Effect.fail(
        new DataError({
          reason: "Unavailable",
          message: `${label} between ${min} and ${max} required`,
        }),
      )
}

function positiveResolution(payload: {
  readonly width: number
  readonly height: number
}): Effect.Effect<void, DataError> {
  return positive("width", payload.width, 16_384).pipe(
    Effect.andThen(positive("height", payload.height, 16_384)),
  )
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
