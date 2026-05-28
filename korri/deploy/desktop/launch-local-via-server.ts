/**
 * `launchLocal` delegate that forwards local-source library launches
 * from the renderer's launch-bridge back to the in-process korri-server's
 * `app.library.launch` RPC. The server then delegates to sessiond, which
 * owns the kiosk renderer-ownership lifecycle (see
 * `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`).
 *
 * Why this helper exists:
 *
 *   - The launch-bridge (`korri/deploy/desktop/launch-bridge.ts`) intercepts
 *     payloads whose `source.isLocal === true` and routes them through
 *     an injected `launchLocal` delegate. When no delegate is wired, the
 *     bridge fails closed with a typed `host-unavailable` response and
 *     the renderer shows "Could not launch <game>." — exactly the
 *     observed regression on Sobo post-migration.
 *
 *   - We can't reuse `LauncherLayerRpc` from `korri/products/app/features/home`
 *     here: that layer is configured with a relative `/api/rpc` URL which
 *     resolves in the renderer's WebKit fetch context, not in the
 *     desktop bun process. The desktop bun needs an absolute URL.
 *
 *   - Implementing Effect-RPC layers inside main.ts would pull a heavy
 *     dependency surface into the launcher (Effect runtime, Layer
 *     wiring) for a single fire-and-forget RPC call. The wire format is
 *     a stable JSON envelope (`BatchJsonSerialization`); a small,
 *     dependency-free fetch is the right shape here.
 */

import type {
  LocalStreamLaunchPayload,
  LocalStreamLaunchResponse,
} from "@app/stream/local-stream-launch-rpc"
import type { LaunchFailureKind } from "@shared/library/launcher"

const LOCAL_LAUNCH_TIMEOUT_MS = 120_000

export interface LaunchLocalViaServerOptions {
  /**
   * Optional fetch override (tests inject a stub). Defaults to the
   * global `fetch` (Bun supplies one).
   */
  readonly fetch?: typeof globalThis.fetch

  /**
   * Optional clock override for the request id (tests pin to a fixed
   * value). Defaults to `Date.now`.
   */
  readonly now?: () => number

  /**
   * Optional request timeout. Defaults to 120s (cold cache + first
   * gamescope spawn on a constrained handheld can take ~60s).
   */
  readonly timeoutMs?: number
}

/**
 * Build a `launchLocal` delegate suitable for `LaunchBridgeOptions`.
 *
 * The returned function POSTs an Effect-RPC `app.library.launch` frame
 * to the source's `controlUrl` (which for local-source payloads is the
 * in-process korri-server). It maps the server's launched/failed
 * response back into the bridge's `LocalStreamLaunchResponse` shape.
 */
export function createLaunchLocalViaServer(
  options: LaunchLocalViaServerOptions = {},
): (payload: LocalStreamLaunchPayload) => Promise<LocalStreamLaunchResponse> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? LOCAL_LAUNCH_TIMEOUT_MS

  return async function launchLocalViaServer(payload) {
    const controlUrl = payload.source?.controlUrl
    if (!controlUrl) {
      return {
        status: "failed",
        category: "host-unavailable",
        message:
          "launch-local: payload.source.controlUrl is missing; cannot forward to in-process server",
      }
    }

    const requestId = String(now() % 1_000_000_000)
    const frame = {
      _tag: "Request",
      id: requestId,
      tag: "app.library.launch",
      headers: [] as ReadonlyArray<[string, string]>,
      payload: { id: payload.id, source: payload.source },
    }

    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(`${controlUrl}/api/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([frame]),
        signal: abort.signal,
      })
    } catch (error) {
      return {
        status: "failed",
        category: "host-unavailable",
        message: `launch-local: fetch failed: ${describeError(error)}`,
      }
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      return {
        status: "failed",
        category: "host-unavailable",
        message: `launch-local: HTTP ${response.status} from ${controlUrl}/api/rpc`,
      }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      return {
        status: "failed",
        category: "host-unavailable",
        message: `launch-local: response was not JSON: ${describeError(error)}`,
      }
    }

    return mapRpcResponse(payload.id, body)
  }
}

function mapRpcResponse(
  gameId: string,
  body: unknown,
): LocalStreamLaunchResponse {
  if (!Array.isArray(body) || body.length === 0) {
    return {
      status: "failed",
      category: "host-unavailable",
      message: "launch-local: response was not an Exit frame array",
    }
  }

  const exit = (body[0] as { exit?: unknown }).exit
  if (
    !exit ||
    typeof exit !== "object" ||
    !("_tag" in exit) ||
    (exit as { _tag: unknown })._tag !== "Success"
  ) {
    const cause =
      exit && typeof exit === "object" && "cause" in exit
        ? JSON.stringify((exit as { cause: unknown }).cause)
        : JSON.stringify(exit)
    return {
      status: "failed",
      category: "host-unavailable",
      message: `launch-local: server returned non-success: ${cause}`,
    }
  }

  const value = (exit as { value?: unknown }).value as
    | {
        status?: string
        exitCode?: number
        stderrTail?: string
        failureKind?: LaunchFailureKind
      }
    | undefined

  if (value?.status === "launched") {
    return {
      status: "launched",
      gameId,
      // No moonlight involved for local-source launches. Kept as a
      // sentinel so the wire shape stays in sync with the schema.
      moonlightCommand: "sessiond",
    }
  }

  if (value?.status === "failed") {
    return {
      status: "failed",
      category: mapLaunchFailureKind(value.failureKind),
      message:
        value.stderrTail ??
        `launch-local: server reported failed (exit ${value.exitCode ?? "?"})`,
    }
  }

  return {
    status: "failed",
    category: "host-unavailable",
    message: `launch-local: unexpected response shape: ${JSON.stringify(value)}`,
  }
}

type LocalLaunchFailedCategory = Exclude<
  LocalStreamLaunchResponse,
  { status: "launched" } | { status: "prepared-no-moonlight" }
>["category"]

function mapLaunchFailureKind(
  kind: LaunchFailureKind | undefined,
): LocalLaunchFailedCategory {
  switch (kind) {
    case "host-unavailable":
    case "host-control-disabled":
    case "no-such-game":
    case "prepare-failed":
    case "input-unavailable":
    case "input-ambiguous":
    case "session-busy":
      return kind
    case "moonlight-failed":
    case "command-failed":
    case undefined:
      return "host-unavailable"
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
