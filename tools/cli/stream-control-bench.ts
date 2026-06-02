import { appendFile, mkdir } from "node:fs/promises"
import { connect } from "node:net"
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

const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_PORT = 4319
const MAX_MOONLIGHT_RESPONSE_BYTES = 128 * 1024
let jsonRpcSequence = 0

export interface StreamControlBenchOptions {
  readonly host?: string
  readonly port?: number
  readonly moonlightSocketPath?: string
  readonly gamescopeSocketPath?: string
  readonly artifactDir?: string
}

export interface StreamControlBenchDependencies {
  readonly connectMoonlight?: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly connectGamescope?: (
    socketPath: string,
  ) => Promise<GamescopeControlClient>
  readonly sendMoonlightResolution?: (
    socketPath: string,
    params: { readonly width: number; readonly height: number },
  ) => Promise<unknown>
  readonly appendFile?: (path: string, content: string) => Promise<void>
  readonly mkdir?: (
    path: string,
    options?: { readonly recursive?: boolean },
  ) => Promise<unknown>
  readonly now?: () => Date
}

interface BenchRuntime {
  readonly options: StreamControlBenchOptions
  readonly connectMoonlight: (
    socketPath: string,
  ) => Promise<MoonlightControlClient>
  readonly connectGamescope: (
    socketPath: string,
  ) => Promise<GamescopeControlClient>
  readonly sendMoonlightResolution: (
    socketPath: string,
    params: { readonly width: number; readonly height: number },
  ) => Promise<unknown>
  readonly record: (event: unknown) => Promise<void>
}

type ParsedPayload<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

export function createStreamControlBenchApp(
  options: StreamControlBenchOptions,
  deps: StreamControlBenchDependencies = {},
) {
  const app = new Hono()
  const runtime = createRuntime(options, deps)

  app.get("/", context => context.html(CONTROL_PANEL_HTML))
  app.get("/api/config", context => context.json(configPayload(options)))
  app.get("/api/state", async context => context.json(await readState(runtime)))

  app.post(
    "/api/moonlight/bitrate",
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
    "/api/moonlight/fps",
    controlMutation(runtime, {
      socketPath: () => runtime.options.moonlightSocketPath,
      disabledError: "moonlight socket disabled",
      connect: runtime.connectMoonlight,
      action: "moonlight.fps",
      parse: parseFps,
      run: (client, data) => client.setFps(data),
    }),
  )
  app.post("/api/moonlight/resolution", moonlightResolutionMutation(runtime))
  app.post(
    "/api/gamescope/mode",
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
    "/api/gamescope/filter",
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
    "/api/gamescope/sharpness",
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
    "/api/gamescope/fps",
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
  options: StreamControlBenchOptions,
  deps: StreamControlBenchDependencies,
): BenchRuntime {
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
    sendMoonlightResolution:
      deps.sendMoonlightResolution ?? sendMoonlightResolutionCommand,
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
  runtime: BenchRuntime,
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

function moonlightResolutionMutation(runtime: BenchRuntime) {
  return async (context: Context) => {
    const payload = parseResolution(await requestJson(context))
    if (!payload.ok) return context.json({ error: payload.error }, 400)
    const result = await runDirectSocketAction({
      socketPath: runtime.options.moonlightSocketPath,
      disabledError: "moonlight socket disabled",
      action: "moonlight.resolution",
      requested: payload.value,
      record: runtime.record,
      run: socketPath =>
        runtime.sendMoonlightResolution(socketPath, payload.value),
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

async function runDirectSocketAction(input: {
  readonly socketPath: string | undefined
  readonly disabledError: string
  readonly action: string
  readonly requested: unknown
  readonly record: (event: unknown) => Promise<void>
  readonly run: (socketPath: string) => Promise<unknown>
}): Promise<Record<string, unknown>> {
  const socketPath = input.socketPath
  if (!socketPath)
    return { ok: false, error: input.disabledError, httpStatus: 503 }
  return await recordActionOutcome(input, () => input.run(socketPath))
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

async function readState(runtime: BenchRuntime) {
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

function sendMoonlightResolutionCommand(
  socketPath: string,
  params: { readonly width: number; readonly height: number },
): Promise<unknown> {
  return sendJsonRpcLine(socketPath, "runtime.setResolution", params)
}

function sendJsonRpcLine(
  socketPath: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `bench-${++jsonRpcSequence}`
    const socket = connect({ path: socketPath })
    let settled = false
    const settle = (complete: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      complete()
    }
    const timeout = setTimeout(() => {
      settle(() => reject(new Error(`${method} timed out`)))
    }, 5000)
    let buffered = ""

    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      )
    })
    socket.on("data", chunk => {
      buffered += chunk.toString("utf8")
      if (buffered.length > MAX_MOONLIGHT_RESPONSE_BYTES) {
        settle(() =>
          reject(new Error(`${method} response exceeded max frame size`)),
        )
        return
      }
      for (const line of drainLines()) {
        if (line.length === 0) continue
        let frame: {
          readonly id?: unknown
          readonly error?: unknown
          readonly result?: unknown
        }
        try {
          frame = JSON.parse(line)
        } catch (error) {
          settle(() => reject(error))
          return
        }
        if (frame.id !== id) continue
        if (frame.error) settle(() => reject(frame.error))
        else settle(() => resolve(frame.result))
        return
      }
    })
    socket.once("error", error => {
      settle(() => reject(error))
    })

    function drainLines(): string[] {
      const lines: string[] = []
      while (buffered.includes("\n")) {
        const index = buffered.indexOf("\n")
        lines.push(buffered.slice(0, index))
        buffered = buffered.slice(index + 1)
      }
      return lines
    }
  })
}

function configPayload(options: StreamControlBenchOptions) {
  return {
    moonlight: { enabled: Boolean(options.moonlightSocketPath) },
    gamescope: { enabled: Boolean(options.gamescopeSocketPath) },
    artifactDir: options.artifactDir ?? null,
  }
}

export async function runStreamControlBenchCommand(
  argv: readonly string[],
  io: {
    readonly write?: (line: string) => void
    readonly writeError?: (line: string) => void
    readonly serve?: typeof Bun.serve
  } = {},
): Promise<number> {
  const parsed = parseArgs(argv, process.env)
  const write = io.write ?? (line => console.log(line))
  const writeError = io.writeError ?? (line => console.error(line))
  if (typeof parsed === "string") {
    writeError(parsed)
    return 2
  }

  const app = createStreamControlBenchApp(parsed)
  const serve = io.serve ?? Bun.serve
  const server = serve({
    hostname: parsed.host ?? DEFAULT_HOST,
    port: parsed.port ?? DEFAULT_PORT,
    fetch: app.fetch,
  })
  write(
    `stream-control-bench listening on http://${server.hostname}:${server.port} artifactDir=${parsed.artifactDir ?? "disabled"}`,
  )
  await waitForSignal()
  server.stop(true)
  return 0
}

function parseArgs(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): StreamControlBenchOptions | string {
  const flags = argvFlags(argv)
  const port = parsePort(flags.get("port") ?? env.KORRI_CONTROL_BENCH_PORT)
  return typeof port === "string" ? port : optionsFromFlags(flags, env, port)
}

function parsePort(raw: string | undefined): number | string | undefined {
  const port = numberFrom(raw)
  if (port !== undefined && port <= 0) return "--port must be positive"
  return port
}

function optionsFromFlags(
  flags: ReadonlyMap<string, string>,
  env: Record<string, string | undefined>,
  port: number | undefined,
): StreamControlBenchOptions {
  return {
    host: flags.get("host") ?? env.KORRI_CONTROL_BENCH_HOST ?? DEFAULT_HOST,
    port: port ?? DEFAULT_PORT,
    moonlightSocketPath:
      flags.get("moonlight-socket") ?? env.MOONLIGHT_LOCAL_CONTROL_SOCKET,
    gamescopeSocketPath:
      flags.get("gamescope-socket") ?? env.KORRI_GAMESCOPE_CONTROL_SOCKET,
    artifactDir:
      flags.get("artifact-dir") ??
      env.KORRI_CONTROL_BENCH_ARTIFACT_DIR ??
      `/tmp/korri-control-bench-${dateStamp()}`,
  }
}

function argvFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]?.trim()
    if (flag?.startsWith("--") && value) flags.set(flag.slice(2), value)
  }
  return flags
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
  const fps = readPositiveNumber(body, "fps")
  return fps
    ? { ok: true, value: { fps } }
    : { ok: false, error: "fps required" }
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
  return sharpness === undefined
    ? { ok: false, error: "sharpness required" }
    : { ok: true, value: { sharpness } }
}

const CONTROL_PANEL_HTML =
  '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Korri stream control bench</title>\n<script src="https://cdn.tailwindcss.com"></script>\n<style>\n:root { color-scheme: dark; }\nbody { background: #080b10; color: #f7fbff; }\n.control-card { border: 1px solid #263244; border-radius: 1rem; background: #111722; padding: 1rem; }\n.control-slider { width: 100%; accent-color: #2f81f7; }\n.stepper { min-width: 3.25rem; min-height: 3.25rem; border-radius: .75rem; background: #1f6feb; color: white; font-size: 1.75rem; font-weight: 900; }\n.radio-pill { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid #344154; border-radius: 9999px; padding: .75rem 1rem; font-weight: 800; }\n.radio-pill input { width: 1.5rem; height: 1.5rem; }\n</style>\n</head>\n<body class="min-h-screen p-4 font-sans">\n<main class="mx-auto max-w-6xl space-y-4">\n  <header>\n    <h1 class="text-3xl font-black tracking-tight">Korri stream control bench</h1>\n    <p class="text-sm text-slate-300">Debounced slider changes apply after 500ms. Keep Moonlight and Gamescope controls under their own headings.</p>\n  </header>\n\n  <section class="control-card space-y-5" aria-labelledby="moonlight-heading">\n    <h2 id="moonlight-heading" class="text-2xl font-black">Moonlight stream</h2>\n    <div class="grid gap-5 md:grid-cols-2">\n      <div class="space-y-2" data-range-control="moonlight-bitrate" data-endpoint="/api/moonlight/bitrate" data-kind="bitrate">\n        <div class="flex items-center justify-between gap-3"><label for="moonlight-bitrate" class="text-lg font-bold">Bitrate</label><output class="text-lg font-black text-blue-300" data-output="moonlight-bitrate"></output></div>\n        <div class="flex items-center gap-3"><button class="stepper" data-step="-500">−</button><input id="moonlight-bitrate" class="control-slider" type="range" min="0" max="100000" step="500" value="12000" /><button class="stepper" data-step="500">+</button></div>\n        <div class="text-xs text-slate-400">0–100 Mbps</div>\n      </div>\n\n      <div class="space-y-2" data-range-control="moonlight-fps" data-endpoint="/api/moonlight/fps" data-kind="fps">\n        <div class="flex items-center justify-between gap-3"><label for="moonlight-fps" class="text-lg font-bold">FPS</label><output class="text-lg font-black text-blue-300" data-output="moonlight-fps"></output></div>\n        <div class="flex items-center gap-3"><button class="stepper" data-step="-1">−</button><input id="moonlight-fps" class="control-slider" type="range" min="0" max="7" step="1" value="3" /><button class="stepper" data-step="1">+</button></div>\n        <div class="text-xs text-slate-400">30, 40, 45, 60, 75, 90, 100, 120</div>\n      </div>\n\n      <div class="space-y-2 md:col-span-2" data-range-control="moonlight-resolution" data-endpoint="/api/moonlight/resolution" data-kind="resolution">\n        <div class="flex items-center justify-between gap-3"><label for="moonlight-resolution" class="text-lg font-bold">Resolution</label><output class="text-lg font-black text-blue-300" data-output="moonlight-resolution"></output></div>\n        <div class="flex items-center gap-3"><button class="stepper" data-step="-1">−</button><input id="moonlight-resolution" class="control-slider" type="range" min="0" max="6" step="1" value="6" /><button class="stepper" data-step="1">+</button></div>\n        <div class="text-xs text-slate-400">360p, 480p, 540p, 576p, 720p, 900p, 1080p</div>\n      </div>\n    </div>\n  </section>\n\n  <section class="control-card space-y-5" aria-labelledby="gamescope-heading">\n    <h2 id="gamescope-heading" class="text-2xl font-black">Gamescope presentation</h2>\n    <div class="grid gap-5 md:grid-cols-2">\n      <div class="space-y-2" data-range-control="gamescope-resolution" data-endpoint="/api/gamescope/mode" data-kind="resolution">\n        <div class="flex items-center justify-between gap-3"><label for="gamescope-resolution" class="text-lg font-bold">Resolution</label><output class="text-lg font-black text-emerald-300" data-output="gamescope-resolution"></output></div>\n        <div class="flex items-center gap-3"><button class="stepper" data-step="-1">−</button><input id="gamescope-resolution" class="control-slider" type="range" min="0" max="6" step="1" value="6" /><button class="stepper" data-step="1">+</button></div>\n      </div>\n\n      <div class="space-y-2" data-range-control="gamescope-fps" data-endpoint="/api/gamescope/fps" data-kind="fps">\n        <div class="flex items-center justify-between gap-3"><label for="gamescope-fps" class="text-lg font-bold">FPS</label><output class="text-lg font-black text-emerald-300" data-output="gamescope-fps"></output></div>\n        <div class="flex items-center gap-3"><button class="stepper" data-step="-1">−</button><input id="gamescope-fps" class="control-slider" type="range" min="0" max="7" step="1" value="3" /><button class="stepper" data-step="1">+</button></div>\n      </div>\n\n      <div class="space-y-2" data-range-control="gamescope-sharpness" data-endpoint="/api/gamescope/sharpness" data-kind="sharpness">\n        <div class="flex items-center justify-between gap-3"><label for="gamescope-sharpness" class="text-lg font-bold">Sharpness</label><output class="text-lg font-black text-emerald-300" data-output="gamescope-sharpness"></output></div>\n        <div class="flex items-center gap-3"><button class="stepper" data-step="-1">−</button><input id="gamescope-sharpness" class="control-slider" type="range" min="0" max="20" step="1" value="10" /><button class="stepper" data-step="1">+</button></div>\n        <div class="text-xs text-slate-400">0–20</div>\n      </div>\n\n      <fieldset class="space-y-3">\n        <legend class="text-lg font-bold">Scaling filter</legend>\n        <div class="flex flex-wrap gap-3" data-radio-control="gamescope-filter" data-endpoint="/api/gamescope/filter">\n          <label class="radio-pill"><input type="radio" name="gamescope-filter" value="linear" checked /> Linear</label>\n          <label class="radio-pill"><input type="radio" name="gamescope-filter" value="fsr" /> FSR</label>\n          <label class="radio-pill"><input type="radio" name="gamescope-filter" value="nearest" /> Nearest</label>\n          <label class="radio-pill"><input type="radio" name="gamescope-filter" value="integer" /> Integer</label>\n          <label class="radio-pill"><input type="radio" name="gamescope-filter" value="nis" /> NIS</label>\n        </div>\n      </fieldset>\n    </div>\n  </section>\n\n  <section class="control-card space-y-3">\n    <div class="flex flex-wrap gap-3"><button class="rounded-xl bg-emerald-700 px-5 py-4 text-lg font-black" onclick="refresh()">Refresh</button><button class="rounded-xl bg-blue-700 px-5 py-4 text-lg font-black" onclick="recover()">Recover Moonlight 1080/60/12</button></div>\n    <pre id="status" class="max-h-96 overflow-auto rounded-xl bg-black p-3 text-xs">loading…</pre>\n  </section>\n</main>\n<script>\nconst DEBOUNCE_MS = 500\nconst fpsSteps = [30, 40, 45, 60, 75, 90, 100, 120]\nconst resSteps = [\n  { label: \'360p\', width: 640, height: 360 },\n  { label: \'480p\', width: 854, height: 480 },\n  { label: \'540p\', width: 960, height: 540 },\n  { label: \'576p\', width: 1024, height: 576 },\n  { label: \'720p\', width: 1280, height: 720 },\n  { label: \'900p\', width: 1600, height: 900 },\n  { label: \'1080p\', width: 1920, height: 1080 },\n]\nconst timers = new Map()\nconst q = id => document.getElementById(id)\nfunction format(kind, value) {\n  if (kind === \'bitrate\') return (Number(value) / 1000).toFixed(Number(value) % 1000 === 0 ? 0 : 1) + " Mbps"\n  if (kind === \'fps\') return fpsSteps[Number(value)] + " FPS"\n  if (kind === \'resolution\') return resSteps[Number(value)].label\n  if (kind === \'sharpness\') return String(value)\n  return String(value)\n}\nfunction payload(kind, value) {\n  if (kind === \'bitrate\') return { bitrateKbps: Number(value) }\n  if (kind === \'fps\') return { fps: fpsSteps[Number(value)] }\n  if (kind === \'resolution\') { const r = resSteps[Number(value)]; return { width: r.width, height: r.height } }\n  if (kind === \'sharpness\') return { sharpness: Number(value) }\n  return {}\n}\nasync function post(path, body) {\n  const res = await fetch(path, { method: \'POST\', headers: { \'content-type\': \'application/json\' }, body: JSON.stringify(body) })\n  q(\'status\').textContent = JSON.stringify(await res.json(), null, 2)\n  setTimeout(refresh, 300)\n}\nfunction schedule(id, path, body) {\n  clearTimeout(timers.get(id))\n  timers.set(id, setTimeout(() => post(path, body), DEBOUNCE_MS))\n}\nfunction bindRange(card) {\n  const id = card.dataset.rangeControl\n  const endpoint = card.dataset.endpoint\n  const kind = card.dataset.kind\n  const input = card.querySelector(\'input[type="range"]\')\n  const output = card.querySelector("[data-output=\\"" + id + "\\"]")\n  const update = () => { output.textContent = format(kind, input.value); schedule(id, endpoint, payload(kind, input.value)) }\n  const preview = () => { output.textContent = format(kind, input.value) }\n  input.addEventListener(\'input\', update)\n  for (const button of card.querySelectorAll(\'[data-step]\')) button.addEventListener(\'click\', () => { input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.step)))); update() })\n  preview()\n}\nfunction bindRadio(group) {\n  const endpoint = group.dataset.endpoint\n  for (const input of group.querySelectorAll(\'input[type="radio"]\')) input.addEventListener(\'change\', () => { if (input.checked) schedule(group.dataset.radioControl, endpoint, { filter: input.value }) })\n}\nasync function refresh() {\n  const res = await fetch(\'/api/state\')\n  q(\'status\').textContent = JSON.stringify(await res.json(), null, 2)\n}\nconst sleep = ms => new Promise(resolve => setTimeout(resolve, ms))\nasync function recover() {\n  await post(\'/api/moonlight/bitrate\', { bitrateKbps: 12000 })\n  await sleep(700)\n  await post(\'/api/moonlight/fps\', { fps: 60 })\n  await sleep(700)\n  await post(\'/api/moonlight/resolution\', { width: 1920, height: 1080 })\n}\nfor (const card of document.querySelectorAll(\'[data-range-control]\')) bindRange(card)\nfor (const group of document.querySelectorAll(\'[data-radio-control]\')) bindRadio(group)\nrefresh(); setInterval(refresh, 3000)\n</script>\n</body>\n</html>\n'

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

function numberFrom(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function waitForSignal(): Promise<void> {
  return new Promise(resolve => {
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
  })
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

function dateStamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .replace(/-/g, "")
    .slice(0, 15)
}

if (import.meta.main) {
  runStreamControlBenchCommand(Bun.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode
  })
}
