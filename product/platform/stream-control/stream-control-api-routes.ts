import { appendFile, mkdir } from "node:fs/promises"
import {
  connectMoonlightControl,
  type MoonlightControlClient,
} from "@platform/stream/moonlight-control-client"
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
import { normalizeMoonlightState } from "@platform/stream-control/state-normalizer"
import { isRecord } from "@platform/stream-control/utils"
import type { Context } from "hono"
import { Hono } from "hono"

export interface StreamControlApiOptions {
  readonly moonlightSocketPath?: string
  readonly artifactDir?: string
}

export interface GenericControlProvider {
  readonly id: string
  readonly enabled: boolean
  readonly controls: readonly StreamControlCapability[]
  readonly readState?: () => Promise<unknown>
  readonly applyAction?: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>
}

export interface StreamControlApiDependencies {
  readonly connectMoonlight?: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly controlProviders?: readonly GenericControlProvider[]
  readonly appendFile?: (path: string, content: string) => Promise<void>
  readonly mkdir?: (
    path: string,
    options?: { readonly recursive?: boolean },
  ) => Promise<unknown>
  readonly now?: () => Date
}

interface StreamControlRuntime {
  readonly options: StreamControlApiOptions
  readonly providers: readonly GenericControlProvider[]
  readonly connectMoonlight: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
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

  app.get("/config", context => context.json(configPayload(runtime)))
  app.get("/controls", context => context.json(controlsPayload(runtime)))
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
  app.post("/action", async context => {
    const payload = parseGenericAction(await requestJson(context))
    if (!payload.ok)
      return context.json({ ok: false, error: payload.error }, 400)
    const result = await applyGenericAction(runtime, payload.value)
    return jsonOutcome(context, result)
  })

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
    providers: deps.controlProviders ?? [],
    connectMoonlight:
      deps.connectMoonlight ??
      ((socketPath: string) => connectMoonlightControl({ socketPath })),
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

async function applyGenericAction(
  runtime: StreamControlRuntime,
  input: { readonly action: string; readonly payload: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const provider = runtime.providers.find(candidate =>
    candidate.controls.some(control => control.action === input.action),
  )
  if (!provider?.applyAction) {
    return { ok: false, error: "unsupported action", httpStatus: 404 }
  }
  return await recordActionOutcome(
    { action: input.action, requested: input.payload, record: runtime.record },
    () => provider.applyAction?.(input.action, input.payload),
  )
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
  run: () => Promise<unknown> | undefined,
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
  return context.json(
    body,
    httpStatus === 404 || httpStatus === 503 ? httpStatus : 200,
  )
}

async function readState(runtime: StreamControlRuntime) {
  const [moonlight, providerEntries] = await Promise.all([
    readControlState(
      runtime.options.moonlightSocketPath,
      runtime.connectMoonlight,
      client => client.state(),
      normalizeMoonlightState,
    ),
    Promise.all(
      runtime.providers.map(
        async provider =>
          [
            provider.id,
            provider.readState
              ? await provider.readState()
              : { status: "disabled" },
          ] as const,
      ),
    ),
  ])
  const result = {
    moonlight,
    brightness: { status: "disabled" as const },
    battery: { status: "disabled" as const },
    plugins: Object.fromEntries(providerEntries),
  }
  await recordStateSnapshot(runtime.record, result)
  return result
}

function configPayload(runtime: StreamControlRuntime) {
  return {
    moonlight: { enabled: Boolean(runtime.options.moonlightSocketPath) },
    brightness: { enabled: false },
    battery: { enabled: false },
    plugins: Object.fromEntries(
      runtime.providers.map(provider => [
        provider.id,
        { enabled: provider.enabled },
      ]),
    ),
    artifactDir: runtime.options.artifactDir ?? null,
  }
}

function controlsPayload(runtime: StreamControlRuntime) {
  return streamControlCapabilities(
    {
      moonlight: Boolean(runtime.options.moonlightSocketPath),
      brightness: false,
      battery: false,
    },
    runtime.providers.flatMap(provider => provider.controls),
  )
}

async function requestJson(context: Context): Promise<unknown> {
  return await context.req.json().catch(() => undefined)
}

function parseGenericAction(body: unknown): ParsedPayload<{
  readonly action: string
  readonly payload: Record<string, unknown>
}> {
  if (!isRecord(body) || typeof body.action !== "string") {
    return { ok: false, error: "action required" }
  }
  return {
    ok: true,
    value: {
      action: body.action,
      payload: isRecord(body.payload) ? body.payload : {},
    },
  }
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

function parseResolution(
  body: unknown,
): ParsedPayload<{ readonly width: number; readonly height: number }> {
  const width = readPositiveNumber(body, "width")
  const height = readPositiveNumber(body, "height")
  return width && height
    ? { ok: true, value: { width, height } }
    : { ok: false, error: "width and height required" }
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
