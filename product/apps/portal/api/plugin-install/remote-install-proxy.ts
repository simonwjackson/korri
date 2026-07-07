import { DataError, ValidationError } from "@platform/api/rpc/errors"
import { rpcProtocolHttpLayer } from "@platform/api/rpc/client-layer"
import type { EntrySource } from "@platform/api/rpc/entry-source"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import {
  makeFilePeerStore,
  type PeerStore,
} from "@product/apps/portal/peers/peer-store"
import { Effect } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import { INSTALL_CONTROL_COOKIE } from "./install-control-authorization"
import type {
  RequestPluginInstallPayload,
  RequestPluginInstallResponse,
} from "./request.rpc"
import type {
  PluginInstallStatusPayload,
  PluginInstallStatusResponse,
} from "./status.rpc"

const DEFAULT_REMOTE_INSTALL_TIMEOUT_MS = 5_000

const remoteInstallSessions = new Map<string, string>()

export interface RemoteInstallProxyOptions {
  readonly fetch?: typeof fetch
  readonly peerStore?: Pick<PeerStore, "load">
  readonly timeoutMs?: number
}

export function isRemoteInstallSource(
  source: EntrySource | undefined,
): source is EntrySource {
  return source !== undefined && source.isLocal === false
}

export function validateRemoteInstallSource(source: EntrySource): string {
  const controlUrl = normalizeRemoteControlUrl(source.controlUrl)
  if (source.isLocal) {
    throw new ValidationError({
      message: "Remote install source must be remote",
    })
  }
  if (source.hostId.trim().length === 0) {
    throw new ValidationError({
      message: "Remote install source host is required",
    })
  }
  return controlUrl
}

export async function trustedRemoteInstallControlUrl(
  source: EntrySource,
  options: RemoteInstallProxyOptions = {},
): Promise<string> {
  const requestedControlUrl = validateRemoteInstallSource(source)
  const peerStore = options.peerStore ?? makeFilePeerStore()
  const peers = await peerStore.load()
  const peer = peers.find(candidate => candidate.hostId === source.hostId)
  if (!peer) {
    throw new ValidationError({
      message: `Remote install source ${source.hostId} is not trusted`,
    })
  }
  if (!peer.caps.includes("source")) {
    throw new ValidationError({
      message: `Remote install source ${source.hostId} is not a source host`,
    })
  }
  const trustedControlUrl = normalizeRemoteControlUrl(peer.controlUrl)
  if (trustedControlUrl !== requestedControlUrl) {
    throw new ValidationError({
      message: "Remote install source URL does not match trusted peer registry",
    })
  }
  return trustedControlUrl
}

export async function createRemoteInstallControlSession(
  source: EntrySource,
  submitted: string,
  options: RemoteInstallProxyOptions = {},
): Promise<Response> {
  const controlUrl = await trustedRemoteInstallControlUrl(source, options)
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_INSTALL_TIMEOUT_MS
  const response = await fetchWithTimeout(
    options.fetch ?? fetch,
    `${controlUrl}/api/install-control/session`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: submitted }),
    },
    timeoutMs,
  )

  if (response.ok) {
    const setCookie = response.headers.get("set-cookie")
    const sessionCookie = sessionCookieFromSetCookie(setCookie)
    if (sessionCookie) remoteInstallSessions.set(controlUrl, sessionCookie)
  } else if (response.status === 401 || response.status === 403) {
    remoteInstallSessions.delete(controlUrl)
  }

  return response
}

export function requestRemotePluginInstall(
  payload: typeof RequestPluginInstallPayload.Type,
): Effect.Effect<
  typeof RequestPluginInstallResponse.Type,
  DataError | ValidationError
> {
  return Effect.tryPromise({
    try: async () => {
      const source = payload.source
      if (!isRemoteInstallSource(source)) {
        throw new ValidationError({ message: "Remote install source required" })
      }
      const controlUrl = await trustedRemoteInstallControlUrl(source)
      return await runRemoteInstallRpc(controlUrl, client =>
        client["app.plugin.install.request"]({
          providerId: payload.providerId,
          appId: payload.appId,
          ...(payload.playableId ? { playableId: payload.playableId } : {}),
          ...(payload.mode ? { mode: payload.mode } : {}),
        }),
      )
    },
    catch: error => remoteInstallError(error),
  })
}

export function requestRemotePluginInstallStatus(
  payload: typeof PluginInstallStatusPayload.Type,
): Effect.Effect<
  typeof PluginInstallStatusResponse.Type,
  DataError | ValidationError
> {
  return Effect.tryPromise({
    try: async () => {
      const source = payload.source
      if (!isRemoteInstallSource(source)) {
        throw new ValidationError({ message: "Remote install source required" })
      }
      const controlUrl = await trustedRemoteInstallControlUrl(source)
      return await runRemoteInstallRpc(controlUrl, client =>
        client["app.plugin.install.status"]({
          providerId: payload.providerId,
          appId: payload.appId,
          ...(payload.requestId ? { requestId: payload.requestId } : {}),
        }),
      )
    },
    catch: error => remoteInstallError(error),
  })
}

interface RemoteInstallRpcClient {
  readonly "app.plugin.install.request": (
    payload: Omit<typeof RequestPluginInstallPayload.Type, "source">,
  ) => Effect.Effect<typeof RequestPluginInstallResponse.Type, unknown>
  readonly "app.plugin.install.status": (
    payload: Omit<typeof PluginInstallStatusPayload.Type, "source">,
  ) => Effect.Effect<typeof PluginInstallStatusResponse.Type, unknown>
}

async function runRemoteInstallRpc<T>(
  controlUrl: string,
  run: (client: RemoteInstallRpcClient) => Effect.Effect<T, unknown>,
): Promise<T> {
  const sessionCookie = remoteInstallSessions.get(controlUrl)
  const layer = rpcProtocolHttpLayer(`${controlUrl}/api/rpc`, {
    headers: sessionCookie ? { cookie: sessionCookie } : {},
  })
  const promise = Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client => run(client as RemoteInstallRpcClient)),
        Effect.provide(layer),
      ) as never,
    ),
  ) as Promise<T>
  return await promiseWithTimeout(promise, DEFAULT_REMOTE_INSTALL_TIMEOUT_MS)
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("remote install request timed out")),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function normalizeRemoteControlUrl(controlUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(controlUrl)
  } catch {
    throw new ValidationError({
      message: "Remote install source URL is invalid",
    })
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError({
      message: "Remote install source URL must use HTTP",
    })
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ValidationError({
      message: "Remote install source URL must be an origin",
    })
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new ValidationError({
      message: "Remote install source host is not allowed",
    })
  }
  return parsed.origin
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1")
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:7f") ||
    host.startsWith("fe80:")
  )
    return true
  if (host.startsWith("127.")) return true
  if (host.startsWith("169.254.")) return true
  return false
}

function sessionCookieFromSetCookie(
  setCookie: string | null,
): string | undefined {
  if (!setCookie) return undefined
  const cookie = setCookie.split(";")[0]?.trim()
  return cookie && cookie.startsWith(`${INSTALL_CONTROL_COOKIE}=`)
    ? cookie
    : undefined
}

function remoteInstallError(error: unknown): DataError | ValidationError {
  if (error instanceof ValidationError) return error
  return new DataError({
    reason: "Unavailable",
    message: `Remote install request failed: ${sanitize(String(error))}`,
  })
}

function sanitize(value: string): string {
  return value.replace(/\/(?:[^\s/]+\/)+[^\s]+/g, "<path>").slice(0, 240)
}
