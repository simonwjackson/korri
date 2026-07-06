import type { InputdActionLogger } from "./inputd-actions"

export interface RemoteHostStopOptions {
  readonly controlUrl: string | undefined
  readonly logger: InputdActionLogger
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

interface RpcExitFrame {
  readonly _tag: "Exit"
  readonly requestId: string
  readonly exit:
    | { readonly _tag: "Success"; readonly value: unknown }
    | { readonly _tag: "Failure"; readonly cause?: unknown }
}

const DEFAULT_REMOTE_STOP_TIMEOUT_MS = 10_000

let requestSequence = 0

function createRpcRequestId(): string {
  requestSequence = (requestSequence + 1) % 1_000_000
  return `${Date.now()}${requestSequence.toString().padStart(6, "0")}`
}

export async function stopRemoteGameOnHost(
  options: RemoteHostStopOptions,
): Promise<void> {
  const controlUrl = options.controlUrl?.trim()
  if (!controlUrl) {
    options.logger.warn(
      {},
      "overlay close-game skipped; active stream has no source controlUrl",
    )
    return
  }

  let response: unknown
  try {
    response = await callKorridRpc(
      rpcUrlForControlUrl(controlUrl),
      "app.session.stop",
      { confirmed: true },
      options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      options.timeoutMs ?? DEFAULT_REMOTE_STOP_TIMEOUT_MS,
    )
  } catch (error) {
    options.logger.warn(
      { err: error, controlUrl },
      "overlay close-game failed to stop remote host session",
    )
    return
  }

  options.logger.info(
    { controlUrl, response },
    "overlay close-game requested remote host session stop",
  )
}

async function callKorridRpc(
  rpcUrl: string,
  tag: string,
  payload: unknown,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const requestId = createRpcRequestId()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  if ("unref" in timeout && typeof timeout.unref === "function") timeout.unref()
  let response: Response
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        _tag: "Request",
        id: requestId,
        tag,
        payload,
        headers: [],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)
  }

  const parsed = JSON.parse(text) as unknown
  const frames = Array.isArray(parsed) ? parsed : [parsed]
  const exit = frames.find(isRpcExitFrame)
  if (!exit) {
    throw new Error(`RPC response missing Exit frame: ${text.slice(0, 500)}`)
  }
  if (exit.exit._tag === "Success") return exit.exit.value
  throw new Error(
    `RPC failure: ${JSON.stringify(exit.exit.cause ?? exit.exit)}`,
  )
}

export function rpcUrlForControlUrl(controlUrl: string): string {
  const trimmed = controlUrl.trim().replace(/\/+$/, "")
  return trimmed.endsWith("/api/rpc") ? trimmed : `${trimmed}/api/rpc`
}

function isRpcExitFrame(value: unknown): value is RpcExitFrame {
  return (
    isRecord(value) &&
    value._tag === "Exit" &&
    typeof value.requestId === "string" &&
    isRecord(value.exit) &&
    (value.exit._tag === "Success" || value.exit._tag === "Failure")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
