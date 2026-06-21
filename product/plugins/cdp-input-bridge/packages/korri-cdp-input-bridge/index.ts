#!/usr/bin/env bun
// fallow-ignore-next-line unused-files
import { type ChildProcess, spawn } from "node:child_process"
import {
  type CdpKeyboardEvent,
  createCdpInputTranslator,
  parseEvtestLine,
} from "../../src/bridge-process"
import { resolveBridgeMapping, withAxisThresholds } from "../../src/mapping"

interface CliOptions {
  readonly device: string
  readonly cdpHost: string
  readonly cdpPort: number
  readonly mapping: string
  readonly axisPressThreshold: number
  readonly axisReleaseThreshold: number
  readonly launchId?: string
  readonly watchPid?: number
  readonly attachTimeoutMs: number
  readonly failClosed: boolean
  readonly targetType?: string
  readonly targetUrlPattern?: string
  readonly targetTitlePattern?: string
}

interface CdpTarget {
  readonly type?: string
  readonly title?: string
  readonly url?: string
  readonly webSocketDebuggerUrl?: string
}

const options = parseArgs(process.argv.slice(2))
const abort = new AbortController()
let evtest: ChildProcess | undefined
let socket: WebSocket | undefined
let nextMessageId = 1

function log(message: string): void {
  const prefix = options.launchId ? `[${options.launchId}] ` : ""
  console.error(`korri-cdp-input-bridge: ${prefix}${message}`)
}

function stop(signal: string): void {
  log(`stopping signal=${signal}`)
  abort.abort()
  evtest?.kill("SIGTERM")
  socket?.close()
}

process.once("SIGINT", () => stop("SIGINT"))
process.once("SIGTERM", () => stop("SIGTERM"))

try {
  const target = await waitForTarget(options, abort.signal)
  if (!target.webSocketDebuggerUrl) {
    throw new Error("matching CDP target did not expose webSocketDebuggerUrl")
  }
  socket = await connectWebSocket(target.webSocketDebuggerUrl, abort.signal)
  socket.addEventListener("close", () => stop("cdp-websocket-close"), {
    once: true,
  })
  socket.addEventListener("error", () => stop("cdp-websocket-error"), {
    once: true,
  })

  const translator = createCdpInputTranslator(
    withAxisThresholds(resolveBridgeMapping(options.mapping), {
      pressThreshold: options.axisPressThreshold,
      releaseThreshold: options.axisReleaseThreshold,
    }),
    {
      dispatch: event => dispatchKeyEvent(socket, event),
    },
  )

  if (options.watchPid !== undefined) watchPid(options.watchPid, abort.signal)

  const evtestProcess = spawn("evtest", ["--grab", options.device], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  evtest = evtestProcess
  evtestProcess.stderr?.on("data", chunk => process.stderr.write(chunk))
  evtestProcess.stdout?.setEncoding("utf8")
  evtestProcess.stdout?.on("data", async chunk => {
    for (const line of chunk.split("\n")) {
      const event = parseEvtestLine(line)
      if (event) await translator.handle(event)
    }
  })
  console.log("korri-cdp-input-bridge: ready")

  evtestProcess.once("exit", async (code, signal) => {
    await translator.releaseAll()
    if (
      !abort.signal.aborted &&
      options.failClosed &&
      options.watchPid !== undefined
    ) {
      try {
        process.kill(options.watchPid, "SIGTERM")
      } catch {}
    }
    log(`evtest-exit code=${code ?? "null"} signal=${signal ?? "null"}`)
    process.exit(code === 0 || abort.signal.aborted ? 0 : 1)
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
}

function parseArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (!key?.startsWith("--") || value === undefined)
      usage(`invalid argument near ${key ?? "<end>"}`)
    values.set(key.slice(2), value)
  }
  const device = required(values, "device")
  return {
    device,
    cdpHost: values.get("cdp-host") ?? "127.0.0.1",
    cdpPort: numberArg(values, "cdp-port", 9333),
    mapping: values.get("mapping") ?? "yfs-default",
    axisPressThreshold: numberArg(values, "axis-press-threshold", 12000),
    axisReleaseThreshold: nonNegativeNumberArg(
      values,
      "axis-release-threshold",
      8000,
    ),
    launchId: values.get("launch-id") ?? undefined,
    watchPid: optionalNumberArg(values, "watch-pid"),
    attachTimeoutMs: numberArg(values, "attach-timeout-ms", 5000),
    failClosed: (values.get("fail-closed") ?? "true") !== "false",
    targetType: values.get("target-type") ?? undefined,
    targetUrlPattern: values.get("target-url-pattern") ?? undefined,
    targetTitlePattern: values.get("target-title-pattern") ?? undefined,
  }
}

function usage(message: string): never {
  console.error(`korri-cdp-input-bridge: ${message}`)
  process.exit(2)
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  return values.get(key) ?? usage(`--${key} is required`)
}

function numberArg(
  values: ReadonlyMap<string, string>,
  key: string,
  fallback: number,
): number {
  const raw = values.get(key)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0)
    usage(`--${key} must be a positive integer`)
  return parsed
}

function nonNegativeNumberArg(
  values: ReadonlyMap<string, string>,
  key: string,
  fallback: number,
): number {
  const raw = values.get(key)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0)
    usage(`--${key} must be a non-negative integer`)
  return parsed
}

function optionalNumberArg(
  values: ReadonlyMap<string, string>,
  key: string,
): number | undefined {
  return values.has(key) ? numberArg(values, key, 0) : undefined
}

async function waitForTarget(
  options: CliOptions,
  signal: AbortSignal,
): Promise<CdpTarget> {
  const deadline = Date.now() + options.attachTimeoutMs
  while (!signal.aborted && Date.now() <= deadline) {
    try {
      const response = await fetch(
        `http://${options.cdpHost}:${options.cdpPort}/json/list`,
        { signal },
      )
      const targets = (await response.json()) as CdpTarget[]
      const matches = targets.filter(target => matchesTarget(target, options))
      if (matches.length === 1) {
        const [target] = matches
        if (target) {
          assertLocalWebSocketTarget(target, options)
          return target
        }
      }
      if (matches.length > 1)
        throw new Error(`CDP target selector matched ${matches.length} pages`)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error
    }
    await sleep(100, signal)
  }
  throw new Error("timed out waiting for matching CDP target")
}

function assertLocalWebSocketTarget(
  target: CdpTarget,
  options: CliOptions,
): void {
  if (!target.webSocketDebuggerUrl) return
  const url = new URL(target.webSocketDebuggerUrl)
  if (url.protocol !== "ws:") {
    throw new Error("CDP websocket URL must use ws://")
  }
  if (
    url.hostname !== options.cdpHost ||
    url.port !== String(options.cdpPort)
  ) {
    throw new Error(
      "CDP websocket URL must match the configured loopback endpoint",
    )
  }
}

function matchesTarget(target: CdpTarget, options: CliOptions): boolean {
  if (options.targetType && target.type !== options.targetType) return false
  if (
    options.targetUrlPattern &&
    !target.url?.includes(options.targetUrlPattern)
  )
    return false
  if (
    options.targetTitlePattern &&
    !target.title?.includes(options.targetTitlePattern)
  )
    return false
  return true
}

async function connectWebSocket(
  url: string,
  signal: AbortSignal,
): Promise<WebSocket> {
  const ws = new WebSocket(url)
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    })
    ws.addEventListener("open", () => resolve(ws), { once: true })
    ws.addEventListener(
      "error",
      () => reject(new Error("failed to connect CDP websocket")),
      { once: true },
    )
  })
}

function dispatchKeyEvent(
  ws: WebSocket | undefined,
  event: CdpKeyboardEvent,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN)
    throw new Error("CDP websocket is not open")
  ws.send(
    JSON.stringify({
      id: nextMessageId++,
      method: "Input.dispatchKeyEvent",
      params: event,
    }),
  )
}

function watchPid(pid: number, signal: AbortSignal): void {
  const interval = setInterval(() => {
    try {
      process.kill(pid, 0)
    } catch {
      stop("watch-pid-exit")
    }
  }, 250)
  signal.addEventListener("abort", () => clearInterval(interval), {
    once: true,
  })
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new Error("aborted"))
      },
      { once: true },
    )
  })
}
