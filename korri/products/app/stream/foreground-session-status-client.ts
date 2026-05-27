import {
  decodeForegroundSessionStatusSnapshot,
  type ForegroundSessionStatusSnapshot,
} from "@shared/stream/foreground-session-status"

const FOREGROUND_SESSION_STATUS_URL =
  "/__korri/desktop/foreground-session-status"

export type ForegroundSessionStatusFailureKind = "http" | "network" | "schema"

export type ForegroundSessionStatusResult =
  | {
      readonly _tag: "Success"
      readonly status: ForegroundSessionStatusSnapshot
    }
  | {
      readonly _tag: "Failure"
      readonly kind: ForegroundSessionStatusFailureKind
      readonly message: string
    }

export interface ForegroundSessionStatusClient {
  readonly fetchStatus: (options?: {
    readonly signal?: AbortSignal
  }) => Promise<ForegroundSessionStatusSnapshot>
  readonly fetchStatusResult: (options?: {
    readonly signal?: AbortSignal
  }) => Promise<ForegroundSessionStatusResult>
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

  const fetchStatusResult = async (
    request: { readonly signal?: AbortSignal } = {},
  ): Promise<ForegroundSessionStatusResult> => {
    let response: Response
    try {
      response = await fetchImpl(statusUrl, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: request.signal,
      })
    } catch (error) {
      return { _tag: "Failure", kind: "network", message: errorMessage(error) }
    }

    if (!response.ok) {
      return {
        _tag: "Failure",
        kind: "http",
        message: `Foreground session status request failed with HTTP ${response.status}`,
      }
    }

    try {
      return {
        _tag: "Success",
        status: decodeForegroundSessionStatusSnapshot(await response.json()),
      }
    } catch (error) {
      return { _tag: "Failure", kind: "schema", message: errorMessage(error) }
    }
  }

  return {
    fetchStatus: async request => {
      const result = await fetchStatusResult(request)
      if (result._tag === "Success") return result.status
      throw new Error(result.message)
    },
    fetchStatusResult,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function absoluteStatusUrl(statusUrl: string): string {
  if (!statusUrl.startsWith("/")) return statusUrl
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://desktop.local"
  return new URL(statusUrl, origin).toString()
}
