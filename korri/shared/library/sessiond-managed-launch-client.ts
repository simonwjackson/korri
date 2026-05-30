import { readFile } from "node:fs/promises"
import type { LaunchSpec } from "./launcher"
import {
  decodeSessiondManagedLaunchStartResponse,
  decodeSessiondManagedLaunchStatus,
  decodeSessiondManagedLaunchTerminateResponse,
  type SessiondManagedLaunchLifecycle,
  type SessiondManagedLaunchStartResponse,
  type SessiondManagedLaunchStatus,
  type SessiondManagedLaunchTerminateResponse,
} from "./sessiond-managed-launch-protocol"

export type SessiondManagedLaunchClientFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export interface SessiondManagedLaunchClientOptions {
  readonly url?: string
  readonly token?: string
  readonly tokenFile?: string
  readonly env?: NodeJS.ProcessEnv
  readonly fetchImpl?: SessiondManagedLaunchClientFetch
  readonly timeoutMs?: number
}

export type SessiondManagedLaunchClientFailureKind =
  | "not-configured"
  | "missing-token"
  | "token-rejected"
  | "unavailable"
  | "invalid-payload"

export type SessiondManagedLaunchClientFailure = {
  readonly kind: SessiondManagedLaunchClientFailureKind
  readonly message?: string
}

export type SessiondManagedLaunchStatusResult =
  | { readonly kind: "ok"; readonly status: SessiondManagedLaunchStatus }
  | SessiondManagedLaunchClientFailure

export type SessiondManagedLaunchStartResult =
  | {
      readonly kind: "ok"
      readonly response: SessiondManagedLaunchStartResponse
    }
  | SessiondManagedLaunchClientFailure

export type SessiondManagedLaunchTerminateResult =
  | {
      readonly kind: "ok"
      readonly response: SessiondManagedLaunchTerminateResponse
    }
  | SessiondManagedLaunchClientFailure

export interface SessiondManagedLaunchStartInput {
  readonly spec: LaunchSpec
  readonly lifecycle?: SessiondManagedLaunchLifecycle
  readonly wait?: LaunchSpec
}

export interface SessiondManagedLaunchTerminateInput {
  readonly launchId: string
  readonly force?: boolean
}

const DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS = 10_000

export async function resolveSessiondManagedLaunchToken(
  options: Pick<
    SessiondManagedLaunchClientOptions,
    "token" | "tokenFile" | "env"
  >,
): Promise<string | undefined> {
  const env = options.env ?? process.env
  const direct = options.token ?? env.KORRI_SESSIOND_TOKEN
  if (direct?.trim()) return direct.trim()

  const tokenFile = options.tokenFile ?? env.KORRI_SESSIOND_TOKEN_FILE
  if (!tokenFile?.trim()) return undefined

  try {
    const raw = await readFile(tokenFile, "utf8")
    return raw.trim() || undefined
  } catch {
    return undefined
  }
}

export async function probeSessiondManagedLaunchStatus(
  options: SessiondManagedLaunchClientOptions = {},
): Promise<SessiondManagedLaunchStatusResult> {
  const response = await requestSessiondManagedLaunchJson(
    options,
    "/managed-launch/status",
  )
  if (response.kind !== "ok") return response
  try {
    return {
      kind: "ok",
      status: decodeSessiondManagedLaunchStatus(response.value),
    }
  } catch (error) {
    return invalidPayloadFailure("sessiond status payload invalid", error)
  }
}

export async function requestSessiondManagedLaunchStart(
  input: SessiondManagedLaunchStartInput,
  options: SessiondManagedLaunchClientOptions,
): Promise<SessiondManagedLaunchStartResult> {
  const body: Record<string, unknown> = { spec: input.spec }
  if (input.lifecycle) body.lifecycle = input.lifecycle
  if (input.wait) body.wait = input.wait

  const response = await requestSessiondManagedLaunchJson(
    options,
    "/managed-launch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )
  if (response.kind !== "ok") return response
  try {
    return {
      kind: "ok",
      response: decodeSessiondManagedLaunchStartResponse(response.value),
    }
  } catch (error) {
    return invalidPayloadFailure("sessiond start payload invalid", error)
  }
}

export async function terminateSessiondManagedLaunch(
  input: SessiondManagedLaunchTerminateInput,
  options: SessiondManagedLaunchClientOptions,
): Promise<SessiondManagedLaunchTerminateResult> {
  const response = await requestSessiondManagedLaunchJson(
    options,
    "/managed-launch/terminate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        launchId: input.launchId,
        ...(input.force ? { force: true } : {}),
      }),
    },
  )
  if (response.kind !== "ok") return response
  try {
    return {
      kind: "ok",
      response: decodeSessiondManagedLaunchTerminateResponse(response.value),
    }
  } catch (error) {
    return invalidPayloadFailure("sessiond terminate payload invalid", error)
  }
}

async function requestSessiondManagedLaunchJson(
  options: SessiondManagedLaunchClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<
  | { readonly kind: "ok"; readonly value: unknown }
  | SessiondManagedLaunchClientFailure
> {
  const env = options.env ?? process.env
  const url = options.url ?? env.KORRI_SESSIOND_URL
  if (!url) return { kind: "not-configured" }

  const token = await resolveSessiondManagedLaunchToken(options)
  if (!token) return { kind: "missing-token" }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      String(new URL(path, normalizeBaseUrl(url))),
      {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          "x-korri-sessiond-token": token,
        },
      },
      options.timeoutMs ?? DEFAULT_SESSIOND_REQUEST_TIMEOUT_MS,
    )
  } catch (error) {
    return {
      kind: "unavailable",
      message: `sessiond unreachable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (response.status === 401) {
    return {
      kind: "token-rejected",
      message: `sessiond request rejected: 401 ${await safeResponseText(response)}`,
    }
  }
  if (!response.ok) {
    return {
      kind: "unavailable",
      message: `sessiond request rejected: ${response.status} ${await safeResponseText(response)}`,
    }
  }

  try {
    return { kind: "ok", value: await response.json() }
  } catch (error) {
    return invalidPayloadFailure("sessiond response payload invalid", error)
  }
}

function invalidPayloadFailure(
  prefix: string,
  error: unknown,
): SessiondManagedLaunchClientFailure {
  return {
    kind: "invalid-payload",
    message: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    return `unreadable response body: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function fetchWithTimeout(
  fetchImpl: SessiondManagedLaunchClientFetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  if ("unref" in timeout && typeof timeout.unref === "function") timeout.unref()
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
