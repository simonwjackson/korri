import type { InputdActionLogger } from "./inputd-actions"
import { callKorridRpc, rpcUrlForControlUrl } from "./overlay-remote-stop"

export interface RemoteHostFreezeOptions {
  readonly controlUrl: string | undefined
  readonly logger: InputdActionLogger
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

/**
 * Discriminated outcome for remote freeze/thaw. Preserves the host's typed
 * response variants so callers implement their own fallback policy instead
 * of guessing from a collapsed success/failure boolean.
 */
export type RemoteFreezeResult =
  | { readonly _tag: "applied"; readonly launchId: string }
  | { readonly _tag: "already"; readonly launchId: string }
  | { readonly _tag: "nothing-active" }
  | { readonly _tag: "unsupported"; readonly message?: string }
  | { readonly _tag: "skipped-no-control-url" }
  | { readonly _tag: "failed"; readonly message?: string }

const DEFAULT_REMOTE_FREEZE_TIMEOUT_MS = 10_000

export function freezeRemoteGameOnHost(
  options: RemoteHostFreezeOptions,
): Promise<RemoteFreezeResult> {
  return remoteFreezeCall(options, "app.session.freeze", "freeze")
}

export function thawRemoteGameOnHost(
  options: RemoteHostFreezeOptions,
): Promise<RemoteFreezeResult> {
  return remoteFreezeCall(options, "app.session.thaw", "thaw")
}

async function remoteFreezeCall(
  options: RemoteHostFreezeOptions,
  tag: "app.session.freeze" | "app.session.thaw",
  action: "freeze" | "thaw",
): Promise<RemoteFreezeResult> {
  const controlUrl = options.controlUrl?.trim()
  if (!controlUrl) {
    options.logger.warn(
      {},
      `remote ${action} skipped; active stream has no source controlUrl`,
    )
    return { _tag: "skipped-no-control-url" }
  }

  let value: unknown
  try {
    value = await callKorridRpc(
      rpcUrlForControlUrl(controlUrl),
      tag,
      {},
      options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      options.timeoutMs ?? DEFAULT_REMOTE_FREEZE_TIMEOUT_MS,
    )
  } catch (error) {
    options.logger.warn(
      { err: error, controlUrl },
      `remote ${action} failed to reach the stream host`,
    )
    return {
      _tag: "failed",
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const result = remoteFreezeResultFromResponse(value)
  options.logger.info(
    { controlUrl, result },
    `remote ${action} completed with ${result._tag}`,
  )
  return result
}

function remoteFreezeResultFromResponse(value: unknown): RemoteFreezeResult {
  if (!isRecord(value) || typeof value._tag !== "string") {
    return { _tag: "failed", message: "unrecognized host response" }
  }
  switch (value._tag) {
    case "Frozen":
    case "Thawed":
      return { _tag: "applied", launchId: String(value.launchId) }
    case "AlreadyFrozen":
    case "AlreadyThawed":
      return { _tag: "already", launchId: String(value.launchId) }
    case "NothingActive":
      return { _tag: "nothing-active" }
    case "Unsupported":
      return {
        _tag: "unsupported",
        ...(typeof value.message === "string"
          ? { message: value.message }
          : {}),
      }
    default:
      // SessiondNotConfigured / HostUnavailable / unknown future variants.
      return {
        _tag: "failed",
        ...(typeof value.message === "string"
          ? { message: value.message }
          : { message: value._tag }),
      }
  }
}

export interface RemoteFreezeState {
  /** The host advertises the app.session.freeze/thaw RPCs. */
  readonly freezeCapable: boolean
  /** The host's active launch is frozen; null when the host did not say. */
  readonly frozen: boolean | null
}

/**
 * Read the stream host's freeze capability and frozen state in one
 * app.server.status round-trip. Returns null when the host is unreachable or
 * answers with an unexpected shape, so probe callers keep their last known
 * outcome instead of flapping. Hosts predating the freeze RPCs answer with a
 * capabilities list that lacks "session.freeze".
 */
export async function readRemoteFreezeState(options: {
  readonly controlUrl: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}): Promise<RemoteFreezeState | null> {
  let value: unknown
  try {
    value = await callKorridRpc(
      rpcUrlForControlUrl(options.controlUrl),
      "app.server.status",
      {},
      options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      options.timeoutMs ?? DEFAULT_REMOTE_FREEZE_TIMEOUT_MS,
    )
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities
    : []
  const freezeCapable = capabilities.includes("session.freeze")
  const sessiond = value.sessiond
  if (!isRecord(sessiond)) return { freezeCapable, frozen: null }
  const active = sessiond.active
  if (!isRecord(active)) return { freezeCapable, frozen: false }
  return { freezeCapable, frozen: active.phase === "frozen" }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
