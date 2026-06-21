import {
  createStreamControlApiRoutes,
  type StreamControlApiDependencies,
  type StreamControlApiOptions,
  streamControlApiOptionsFromEnv,
} from "@platform/stream-control/stream-control-api-routes"
import { Hono } from "hono"

const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_PORT = 4319

export interface StreamControlBenchOptions extends StreamControlApiOptions {
  readonly host?: string
  readonly port?: number
}

export interface StreamControlBenchDependencies
  extends StreamControlApiDependencies {}

export function createStreamControlBenchApp(
  options: StreamControlBenchOptions,
  deps: StreamControlBenchDependencies = {},
) {
  const app = new Hono()
  app.get("/", context => context.html(CONTROL_PANEL_HTML))
  app.route("/api", createStreamControlApiRoutes(options, deps))
  return app
}

const CONTROL_PANEL_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Korri stream control bench</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
:root { color-scheme: dark; }
body { background: #080b10; color: #f7fbff; }
.control-card { border: 1px solid #263244; border-radius: 1rem; background: #111722; padding: 1rem; }
.control-slider { width: 100%; accent-color: #2f81f7; }
.stepper { min-width: 3.25rem; min-height: 3.25rem; border-radius: .75rem; background: #1f6feb; color: white; font-size: 1.75rem; font-weight: 900; }
</style>
</head>
<body class="min-h-screen p-4 font-sans">
<main class="mx-auto max-w-6xl space-y-4">
  <header>
    <h1 class="text-3xl font-black tracking-tight">Korri stream control bench</h1>
    <p class="text-sm text-slate-300">Controls are rendered from stream-control metadata. Plugin controls post through the generic action endpoint.</p>
  </header>
  <section id="controls" class="grid gap-4 md:grid-cols-2"></section>
  <section class="control-card space-y-3">
    <button class="rounded-xl bg-emerald-700 px-5 py-4 text-lg font-black" onclick="refresh()">Refresh</button>
    <pre id="status" class="max-h-96 overflow-auto rounded-xl bg-black p-3 text-xs">loading…</pre>
  </section>
</main>
<script>
const q = id => document.getElementById(id)
const timers = new Map()
let controls = []
function endpointFor(control) {
  if (control.action === 'app.stream-control.moonlight-bitrate.set') return '/api/moonlight/bitrate'
  if (control.action === 'app.stream-control.moonlight-fps.set') return '/api/moonlight/fps'
  if (control.action === 'app.stream-control.moonlight-resolution.set') return '/api/moonlight/resolution'
  return '/api/action'
}
function payloadFor(control, value) {
  if (control.value.kind === 'resolutions') {
    const next = control.value.values[Number(value)]
    return { width: next.width, height: next.height }
  }
  if (control.value.kind === 'steps') return { [control.id.endsWith('fps') ? 'fps' : 'value']: control.value.values[Number(value)] }
  if (control.id.includes('bitrate')) return { bitrateKbps: Number(value) }
  return { value: Number(value) }
}
async function post(control, body) {
  const endpoint = endpointFor(control)
  const payload = endpoint === '/api/action' ? { action: control.action, payload: body } : body
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  q('status').textContent = JSON.stringify(await res.json(), null, 2)
  setTimeout(refresh, 300)
}
function schedule(control, body) {
  clearTimeout(timers.get(control.id))
  timers.set(control.id, setTimeout(() => post(control, body), 500))
}
function renderControls() {
  q('controls').innerHTML = ''
  for (const control of controls.filter(item => item.access === 'read-write')) {
    if (control.value.kind === 'read-only') continue
    const card = document.createElement('article')
    card.className = 'control-card space-y-3'
    const label = document.createElement('label')
    label.className = 'text-lg font-bold'
    label.textContent = control.label
    const input = document.createElement('input')
    input.className = 'control-slider'
    input.type = 'range'
    input.disabled = control.status !== 'supported'
    if (control.value.kind === 'range') {
      input.min = String(control.value.min); input.max = String(control.value.max); input.step = String(control.value.step); input.value = String(control.value.min)
    } else if (control.value.kind === 'steps' || control.value.kind === 'resolutions') {
      input.min = '0'; input.max = String(control.value.values.length - 1); input.step = '1'; input.value = '0'
    } else {
      continue
    }
    input.addEventListener('input', () => schedule(control, payloadFor(control, input.value)))
    card.append(label, input)
    if (control.unavailableReason) {
      const hint = document.createElement('p')
      hint.className = 'text-sm text-slate-400'
      hint.textContent = control.unavailableReason
      card.append(hint)
    }
    q('controls').append(card)
  }
}
async function refresh() {
  const [controlsResponse, stateResponse] = await Promise.all([fetch('/api/controls').then(res => res.json()), fetch('/api/state').then(res => res.json())])
  controls = controlsResponse.controls || []
  renderControls()
  q('status').textContent = JSON.stringify(stateResponse, null, 2)
}
refresh(); setInterval(refresh, 3000)
</script>
</body>
</html>
`

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
    ...streamControlApiOptionsFromEnv(env),
    host: flags.get("host") ?? env.KORRI_CONTROL_BENCH_HOST ?? DEFAULT_HOST,
    port: port ?? DEFAULT_PORT,
    moonlightSocketPath:
      flags.get("moonlight-socket") ?? env.MOONLIGHT_LOCAL_CONTROL_SOCKET,
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
