import { appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import {
  connectGamescopeControl,
  type GamescopeControlClient,
} from "@shared/gamescope-control/gamescope-control-client"
import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@shared/stream/moonlight-control-client"
import type { Context } from "hono"
import { Hono } from "hono"

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
      parse: parseFps,
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
    if (!payload.ok) return context.json({ error: payload.error }, 400)
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

function configPayload(options: StreamControlApiOptions) {
  return {
    moonlight: { enabled: Boolean(options.moonlightSocketPath) },
    gamescope: { enabled: Boolean(options.gamescopeSocketPath) },
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
  return bitrateKbps !== undefined && bitrateKbps >= 0 && bitrateKbps <= 100000
    ? { ok: true, value: { bitrateKbps } }
    : { ok: false, error: "bitrateKbps between 0 and 100000 required" }
}

function parseFps(body: unknown): ParsedPayload<{ readonly fps: number }> {
  const fps = readNumber(body, "fps")
  return fps !== undefined && fps >= 30 && fps <= 120
    ? { ok: true, value: { fps } }
    : { ok: false, error: "fps between 30 and 120 required" }
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
  if (!isRecord(body)) return undefined
  const filter = body.filter
  return filter === "linear" ||
    filter === "nearest" ||
    filter === "integer" ||
    filter === "fsr" ||
    filter === "nis"
    ? filter
    : undefined
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
