import {
  decodeForegroundSessionStatusSnapshot,
  type ForegroundSessionStatusSnapshot,
} from "@shared/stream/foreground-session-status"

const FOREGROUND_SESSION_STATUS_URL =
  "/__korri/desktop/foreground-session-status"

export type ForegroundSessionStatusResult =
  | {
      readonly _tag: "Success"
      readonly status: ForegroundSessionStatusSnapshot
    }
  | { readonly _tag: "Failure"; readonly message: string }

export interface ForegroundSessionStatusClient {
  readonly fetchStatus: () => Promise<ForegroundSessionStatusSnapshot>
  readonly fetchStatusResult: () => Promise<ForegroundSessionStatusResult>
}

export type ForegroundSessionStatusFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface ForegroundSessionStatusClientOptions {
  readonly statusUrl?: string
  readonly fetch?: ForegroundSessionStatusFetch
}

export function createForegroundSessionStatusClient(
  options: ForegroundSessionStatusClientOptions = {},
): ForegroundSessionStatusClient {
  const statusUrl = absoluteStatusUrl(
    options.statusUrl ?? FOREGROUND_SESSION_STATUS_URL,
  )
  const fetchImpl = options.fetch ?? fetch

  const fetchStatus = async (): Promise<ForegroundSessionStatusSnapshot> => {
    const response = await fetchImpl(statusUrl, {
      method: "GET",
      headers: { accept: "application/json" },
    })
    if (!response.ok) {
      throw new Error(
        `Foreground session status request failed with HTTP ${response.status}`,
      )
    }
    return decodeForegroundSessionStatusSnapshot(await response.json())
  }

  return {
    fetchStatus,
    fetchStatusResult: async () => {
      try {
        return { _tag: "Success", status: await fetchStatus() }
      } catch (error) {
        return {
          _tag: "Failure",
          message: statusFailureMessage(error),
        }
      }
    },
  }
}

export interface PollForegroundSessionStatusOptions {
  readonly client: ForegroundSessionStatusClient
  readonly intervalMs: number
  readonly signal: AbortSignal
  readonly sleep?: (durationMs: number, signal: AbortSignal) => Promise<void>
  readonly onStatus: (status: ForegroundSessionStatusSnapshot) => void
  readonly onError: (error: Error) => void
}

export async function pollForegroundSessionStatus({
  client,
  intervalMs,
  signal,
  sleep = sleepWithAbort,
  onStatus,
  onError,
}: PollForegroundSessionStatusOptions): Promise<void> {
  while (!signal.aborted) {
    const result = await client.fetchStatusResult()
    if (result._tag === "Success") onStatus(result.status)
    else onError(new Error(result.message))

    if (signal.aborted) return
    await sleep(intervalMs, signal).catch(error => {
      if (!signal.aborted) throw error
    })
  }
}

function statusFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes("schema")
    ? message
    : `foreground session status schema/request failure: ${message}`
}

function sleepWithAbort(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, durationMs)
    const abort = () => {
      clearTimeout(timeout)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

function absoluteStatusUrl(statusUrl: string): string {
  if (!statusUrl.startsWith("/")) return statusUrl
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://desktop.local"
  return new URL(statusUrl, origin).toString()
}
