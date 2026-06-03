import { appRpcGroup } from "@app/api/app-rpc-group"
import { serverRpcGroup } from "@app/api/server/rpc-group"
import type { SessiondLifecycleSummary } from "@app/api/server/status.rpc"
import type { InputBus } from "@platform/input/bus"
import type { KorriPlatformBridge } from "@platform/theme/bridge"
import { RpcClientLive } from "@shared/api/rpc/client"
import { projectForegroundSessionStatusSnapshot } from "@shared/library/sessiond-lifecycle-projections"
import { foregroundSessionGateStateFromSnapshot } from "@shared/stream/foreground-session-gate-state"
import { Effect, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export type PortalRpcRunner = (
  method: string,
  payload: unknown,
) => Promise<unknown>

export interface PortalPlatformBridgeOptions {
  readonly inputBus: InputBus
  readonly desktopInput?: boolean
  readonly appRpc?: PortalRpcRunner
  readonly serverRpc?: PortalRpcRunner
}

export function createPortalPlatformBridge({
  inputBus,
  desktopInput = false,
  appRpc = runAppRpc,
  serverRpc = runServerRpc,
}: PortalPlatformBridgeOptions): KorriPlatformBridge {
  return {
    library: {
      list: async () => {
        try {
          const response = await appRpc("app.library.list", {})
          if (!isLibraryListResponse(response)) {
            throw new Error("app.library.list: unexpected response shape")
          }
          return response.games
        } catch (cause) {
          if (isNoUpstreamCause(cause)) return []
          throw cause
        }
      },
      launch: async input => {
        await appRpc(
          "app.library.launch",
          input.source
            ? { id: input.id, source: input.source }
            : { id: input.id },
        )
      },
    },
    input: {
      subscribe: listener => inputBus.on(listener),
    },
    foregroundSession: {
      get: async () => {
        if (!desktopInput) return { _tag: "Ready" }

        try {
          const response = await serverRpc("app.server.status", {})
          if (!isServerStatusResponse(response)) {
            return foregroundSessionGateStateFromSnapshot({
              _tag: "LoadError",
              message: "app.server.status: unexpected response shape",
            })
          }
          return foregroundSessionGateStateFromSnapshot(
            projectForegroundSessionStatusSnapshot({
              sessiond: response.sessiond,
            }),
          )
        } catch (error) {
          return foregroundSessionGateStateFromSnapshot({
            _tag: "LoadError",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
    api: {
      rpc: (method, payload) => appRpc(method, payload),
    },
  }
}

function runAppRpc(method: string, payload: unknown): Promise<unknown> {
  return Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client => callRpcMethod(client, method, payload)),
        Effect.provide(RpcClientLive),
      ),
    ),
  )
}

function runServerRpc(method: string, payload: unknown): Promise<unknown> {
  return Effect.runPromise(
    Effect.scoped(
      RpcClient.make(serverRpcGroup).pipe(
        Effect.flatMap(client => callRpcMethod(client, method, payload)),
        Effect.provide(RpcClientLive),
      ),
    ),
  )
}

function callRpcMethod(
  client: object,
  method: string,
  payload: unknown,
): Effect.Effect<unknown, unknown, Scope.Scope> {
  const fn = (client as Record<string, unknown>)[method]
  if (typeof fn !== "function") {
    return Effect.fail(new Error(`Unknown RPC method: ${method}`))
  }
  return Reflect.apply(fn, client, [payload]) as Effect.Effect<
    unknown,
    unknown,
    Scope.Scope
  >
}

function isLibraryListResponse(
  value: unknown,
): value is { readonly games: readonly unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "games" in value &&
    Array.isArray(value.games)
  )
}

function isServerStatusResponse(value: unknown): value is {
  readonly serverId: string
  readonly sessiond?: SessiondLifecycleSummary
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "serverId" in value &&
    typeof value.serverId === "string"
  )
}

function isNoUpstreamCause(cause: unknown): boolean {
  const rendered = String(cause)
  return rendered.includes("no upstream") || rendered.includes("503")
}
