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
  const bitrateKbps = readPositiveNumber(body, "bitrateKbps")
  return bitrateKbps
    ? { ok: true, value: { bitrateKbps } }
    : { ok: false, error: "bitrateKbps required" }
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

const CONTROL_PANEL_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Korri stream control bench</title>
<style>
:root { color-scheme: dark; font-family: system-ui, sans-serif; background: #080b10; color: #f7fbff; }
body { margin: 0; padding: 18px; }
h1 { margin: 0 0 12px; font-size: 26px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.card { border: 1px solid #263244; border-radius: 18px; padding: 14px; background: #111722; }
.card h2 { margin: 0 0 12px; font-size: 20px; }
.buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
button { min-height: 58px; border: 0; border-radius: 14px; background: #2f81f7; color: white; font-size: 18px; font-weight: 700; }
button.warn { background: #b7791f; }
button.safe { background: #238636; }
.row { display: flex; gap: 8px; margin-top: 10px; }
input, select { min-width: 0; flex: 1; border-radius: 12px; border: 1px solid #344154; background: #080b10; color: white; padding: 12px; font-size: 18px; }
pre { white-space: pre-wrap; word-break: break-word; max-height: 34vh; overflow: auto; background: #05070a; border-radius: 12px; padding: 12px; }
</style>
</head>
<body>
<h1>Korri stream control bench</h1>
<div class="grid">
  <section class="card">
    <h2>Moonlight stream</h2>
    <div class="buttons">
      <button onclick="post('/api/moonlight/bitrate', { bitrateKbps: 12000 })">12 Mbps</button>
      <button class="warn" onclick="post('/api/moonlight/bitrate', { bitrateKbps: 6000 })">6 Mbps</button>
      <button onclick="post('/api/moonlight/fps', { fps: 60 })">60 FPS</button>
      <button class="warn" onclick="post('/api/moonlight/fps', { fps: 30 })">30 FPS</button>
      <button onclick="post('/api/moonlight/resolution', { width: 1920, height: 1080 })">1080p</button>
      <button class="warn" onclick="post('/api/moonlight/resolution', { width: 1280, height: 720 })">720p</button>
    </div>
    <div class="row"><input id="bitrate" value="9000" inputmode="numeric"><button onclick="post('/api/moonlight/bitrate', { bitrateKbps: Number(q('bitrate').value) })">Set kbps</button></div>
    <div class="row"><input id="streamRes" value="960x540"><button onclick="setRes('/api/moonlight/resolution', 'streamRes')">Set res</button></div>
  </section>
  <section class="card">
    <h2>Gamescope presentation</h2>
    <div class="buttons">
      <button onclick="post('/api/gamescope/mode', { width: 1920, height: 1080 })">Mode 1080p</button>
      <button class="warn" onclick="post('/api/gamescope/mode', { width: 960, height: 540 })">Mode 540p</button>
      <button onclick="post('/api/gamescope/filter', { filter: 'linear' })">Linear</button>
      <button onclick="post('/api/gamescope/filter', { filter: 'fsr' })">FSR</button>
      <button onclick="post('/api/gamescope/sharpness', { sharpness: 0 })">Sharp 0</button>
      <button onclick="post('/api/gamescope/sharpness', { sharpness: 10 })">Sharp 10</button>
    </div>
    <div class="row"><input id="gsRes" value="1280x720"><button onclick="setRes('/api/gamescope/mode', 'gsRes')">Set mode</button></div>
  </section>
  <section class="card">
    <h2>Status</h2>
    <div class="buttons"><button class="safe" onclick="refresh()">Refresh</button></div>
    <pre id="status">loading…</pre>
  </section>
</div>
<script>
const q = id => document.getElementById(id)
async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  q('status').textContent = JSON.stringify(await res.json(), null, 2)
  setTimeout(refresh, 250)
}
function setRes(path, id) {
  const [width, height] = q(id).value.split('x').map(Number)
  post(path, { width, height })
}
async function refresh() {
  const res = await fetch('/api/state')
  q('status').textContent = JSON.stringify(await res.json(), null, 2)
}
refresh(); setInterval(refresh, 3000)
</script>
</body>
</html>`

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
