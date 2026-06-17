import { appendFile, mkdir } from "node:fs/promises"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@platform/stream/moonlight-control-client"
import {
  closeClient,
  createStreamControlEventRecorder,
  errorMessage,
  isRecord,
  readControlState,
  recordStateSnapshot,
} from "@platform/stream-control/runtime-support"
import {
  type GamescopeScalingFilter,
  normalizeGamescopeState,
  normalizeMoonlightState,
  readGamescopeScalingFilter,
} from "@platform/stream-control/state-normalizer"
import type { Context } from "hono"
import { Hono } from "hono"

export interface GamescopeControlClient {
  readonly state: () => Promise<unknown>
  readonly setMode: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setFilter: (payload: {
    readonly filter: GamescopeScalingFilter
  }) => Promise<unknown>
  readonly setSharpness: (payload: {
    readonly sharpness: number
  }) => Promise<unknown>
  readonly requestCommand: (
    method: "fps.set",
    payload?: unknown,
  ) => Promise<unknown>
  readonly close: () => void
}

export interface StreamControlApiOptions {
  readonly moonlightSocketPath?: string
  readonly gamescopeSocketPath?: string
  readonly artifactDir?: string
}

export interface StreamControlApiDependencies {
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

interface StreamControlRuntime {
  readonly options: StreamControlApiOptions
  readonly connectMoonlight: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly connectGamescope: (
    socketPath: string,
  ) => Promise<GamescopeControlClient>
  readonly record: (event: unknown) => Promise<void>
}

type ParsedPayload<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

export function streamControlApiOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): StreamControlApiOptions {
  return {
    moonlightSocketPath: env.MOONLIGHT_LOCAL_CONTROL_SOCKET,
    gamescopeSocketPath: env.KORRI_GAMESCOPE_CONTROL_SOCKET,
    artifactDir:
      env.KORRI_EVIER_ARTIFACT_DIR ?? env.KORRI_CONTROL_BENCH_ARTIFACT_DIR,
  }
}

export function createStreamControlApiRoutes(
  options: StreamControlApiOptions = streamControlApiOptionsFromEnv(),
  deps: StreamControlApiDependencies = {},
) {
  const app = new Hono()
  const runtime = createRuntime(options, deps)

  app.get("/config", context => context.json(configPayload(options)))
  app.get("/state", async context => context.json(await readState(runtime)))

  app.post(
    "/moonlight/bitrate",
    controlMutation(runtime, {
      socketPath: () => runtime.options.moonlightSocketPath,
      disabledError: "moonlight socket disabled",
      connect: runtime.connectMoonlight,
      action: "moonlight.bitrate",
      parse: parseBitrate,
      run: (client, data) => client.setBitrate(data),
    }),
  )
  app.post(
    "/moonlight/fps",
    controlMutation(runtime, {
      socketPath: () => runtime.options.moonlightSocketPath,
      disabledError: "moonlight socket disabled",
      connect: runtime.connectMoonlight,
      action: "moonlight.fps",
      parse: parseFps,
      run: (client, data) => client.setFps(data),
    }),
  )
  app.post(
    "/moonlight/resolution",
    controlMutation(runtime, {
      socketPath: () => runtime.options.moonlightSocketPath,
      disabledError: "moonlight socket disabled",
      connect: runtime.connectMoonlight,
      action: "moonlight.resolution",
      parse: parseResolution,
      run: (client, data) => client.setResolution(data),
    }),
  )
  app.post(
    "/gamescope/mode",
    controlMutation(runtime, {
      socketPath: () => runtime.options.gamescopeSocketPath,
      disabledError: "gamescope socket disabled",
      connect: runtime.connectGamescope,
      action: "gamescope.mode",
      parse: parseResolution,
      run: (client, data) => client.setMode(data),
    }),
  )
  app.post(
    "/gamescope/filter",
    controlMutation(runtime, {
      socketPath: () => runtime.options.gamescopeSocketPath,
      disabledError: "gamescope socket disabled",
      connect: runtime.connectGamescope,
      action: "gamescope.filter",
      parse: parseFilterPayload,
      run: (client, data) => client.setFilter(data),
    }),
  )
  app.post(
    "/gamescope/sharpness",
    controlMutation(runtime, {
      socketPath: () => runtime.options.gamescopeSocketPath,
      disabledError: "gamescope socket disabled",
      connect: runtime.connectGamescope,
      action: "gamescope.sharpness",
      parse: parseSharpness,
      run: (client, data) => client.setSharpness(data),
    }),
  )
  app.post(
    "/gamescope/fps",
    controlMutation(runtime, {
      socketPath: () => runtime.options.gamescopeSocketPath,
      disabledError: "gamescope socket disabled",
      connect: runtime.connectGamescope,
      action: "gamescope.fps",
      parse: parseGamescopeFps,
      run: (client, data) => client.requestCommand("fps.set", data),
    }),
  )

  return app
}

function createRuntime(
  options: StreamControlApiOptions,
  deps: StreamControlApiDependencies,
): StreamControlRuntime {
  const now = deps.now ?? (() => new Date())
  const mkdirImpl = deps.mkdir ?? mkdir
  const appendFileImpl = deps.appendFile ?? appendFile
  return {
    options,
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
    connectGamescope:
      deps.connectGamescope ??
      (() => {
        throw new Error("gamescope connector dependency is required")
      }),
    record: createStreamControlEventRecorder({
      artifactDir: options.artifactDir,
      mkdir: mkdirImpl,
      appendFile: appendFileImpl,
      now,
    }),
  }
}

function controlMutation<TClient, TPayload>(
  runtime: StreamControlRuntime,
  config: {
    readonly socketPath: () => string | undefined
    readonly disabledError: string
    readonly connect: (socketPath: string) => Promise<TClient>
    readonly action: string
    readonly parse: (body: unknown) => ParsedPayload<TPayload>
    readonly run: (client: TClient, payload: TPayload) => Promise<unknown>
  },
) {
  return async (context: Context) => {
    const payload = config.parse(await requestJson(context))
    if (!payload.ok) {
      return context.json({ ok: false, error: payload.error }, 400)
    }
    const result = await runSocketAction({
      socketPath: config.socketPath(),
      disabledError: config.disabledError,
      connect: config.connect,
      action: config.action,
      requested: payload.value,
      record: runtime.record,
      run: client => config.run(client, payload.value),
    })
    return jsonOutcome(context, result)
  }
}

async function runSocketAction<TClient>(input: {
  readonly socketPath: string | undefined
  readonly disabledError: string
  readonly connect: (socketPath: string) => Promise<TClient>
  readonly action: string
  readonly requested: unknown
  readonly record: (event: unknown) => Promise<void>
  readonly run: (client: TClient) => Promise<unknown>
}): Promise<Record<string, unknown>> {
  const socketPath = input.socketPath
  if (!socketPath)
    return { ok: false, error: input.disabledError, httpStatus: 503 }
  let client: TClient | undefined
  try {
    return await recordActionOutcome(input, async () => {
      client = await input.connect(socketPath)
      return await input.run(client)
    })
  } finally {
    closeClient(client)
  }
}

async function recordActionOutcome(
  input: {
    readonly action: string
    readonly requested: unknown
    readonly record: (event: unknown) => Promise<void>
  },
  run: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  try {
    const result = {
      ok: true,
      action: input.action,
      requested: input.requested,
      response: await run(),
    }
    return await recordWithoutChangingOutcome(input.record, result)
  } catch (error) {
    const result = {
      ok: false,
      action: input.action,
      requested: input.requested,
      error: errorMessage(error),
    }
    return await recordWithoutChangingOutcome(input.record, result)
  }
}

async function recordWithoutChangingOutcome(
  record: (event: unknown) => Promise<void>,
  result: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    await record(result)
    return result
  } catch (error) {
    return { ...result, diagnosticError: errorMessage(error) }
  }
}

function jsonOutcome(context: Context, result: Record<string, unknown>) {
  const { httpStatus, ...body } = result
  return context.json(body, httpStatus === 503 ? 503 : 200)
}

async function readState(runtime: StreamControlRuntime) {
  const [moonlight, gamescope] = await Promise.all([
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
  ])
  const result = {
    moonlight,
    gamescope,
    brightness: { status: "disabled" as const },
    battery: { status: "disabled" as const },
  }
  await recordStateSnapshot(runtime.record, result)
  return result
}

function configPayload(options: StreamControlApiOptions) {
  return {
    moonlight: { enabled: Boolean(options.moonlightSocketPath) },
    gamescope: { enabled: Boolean(options.gamescopeSocketPath) },
    brightness: { enabled: false },
    battery: { enabled: false },
    artifactDir: options.artifactDir ?? null,
  }
}

async function requestJson(context: Context): Promise<unknown> {
  return await context.req.json().catch(() => undefined)
}

function parseBitrate(
  body: unknown,
): ParsedPayload<{ readonly bitrateKbps: number }> {
  const bitrateKbps = readNumber(body, "bitrateKbps")
  return bitrateKbps !== undefined &&
    bitrateKbps >= 500 &&
    bitrateKbps <= 150000
    ? { ok: true, value: { bitrateKbps } }
    : {
        ok: false,
        error: "bitrateKbps between 500 and 150000 required",
      }
}

function parseFps(body: unknown): ParsedPayload<{ readonly fps: number }> {
  const fps = readNumber(body, "fps")
  return fps !== undefined && fps >= 30 && fps <= 120
    ? { ok: true, value: { fps } }
    : { ok: false, error: "fps between 30 and 120 required" }
}

// Gamescope's runtime fps limiter accepts 0 ("no limit") through 240. Keep
// it separate from the Moonlight client's 30..120 contract so the routes can
// surface the right error message and don't accidentally tighten Moonlight
// when the gamescope range widens.
function parseGamescopeFps(
  body: unknown,
): ParsedPayload<{ readonly fps: number }> {
  const fps = readNumber(body, "fps")
  return fps !== undefined && Number.isInteger(fps) && fps >= 0 && fps <= 240
    ? { ok: true, value: { fps } }
    : { ok: false, error: "fps between 0 and 240 (integer) required" }
}

function parseResolution(
  body: unknown,
): ParsedPayload<{ readonly width: number; readonly height: number }> {
  const width = readPositiveNumber(body, "width")
  const height = readPositiveNumber(body, "height")
  return width && height
    ? { ok: true, value: { width, height } }
    : { ok: false, error: "width and height required" }
}

function parseFilterPayload(
  body: unknown,
): ParsedPayload<{ readonly filter: GamescopeScalingFilter }> {
  const filter = readFilter(body)
  return filter
    ? { ok: true, value: { filter } }
    : { ok: false, error: "valid filter required" }
}

function parseSharpness(
  body: unknown,
): ParsedPayload<{ readonly sharpness: number }> {
  const sharpness = readNumber(body, "sharpness")
  return sharpness !== undefined && sharpness >= 0 && sharpness <= 20
    ? { ok: true, value: { sharpness } }
    : { ok: false, error: "sharpness between 0 and 20 required" }
}

function readPositiveNumber(body: unknown, key: string): number | undefined {
  const value = readNumber(body, key)
  return value !== undefined && value > 0 ? value : undefined
}

function readNumber(body: unknown, key: string): number | undefined {
  if (!isRecord(body)) return undefined
  const value = Number(body[key])
  return Number.isFinite(value) ? value : undefined
}

function readFilter(body: unknown): GamescopeScalingFilter | undefined {
  return isRecord(body) ? readGamescopeScalingFilter(body.filter) : undefined
}
