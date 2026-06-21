import { RpcClientLive } from "@platform/api/rpc/client"
import { LibraryError } from "@platform/library/library-services"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Context, Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

interface PluginInstallRequestInput {
  readonly providerId: string
  readonly appId: string
  readonly playableId?: string
}

interface PluginInstallStatusInput {
  readonly providerId: string
  readonly appId: string
  readonly requestId?: string
}

export interface PluginInstallControllerService {
  readonly request: (
    input: PluginInstallRequestInput,
  ) => Effect.Effect<unknown, LibraryError>
  readonly status: (
    input: PluginInstallStatusInput,
  ) => Effect.Effect<unknown, LibraryError>
  readonly unlock: (pin: string) => Effect.Effect<void, LibraryError>
}

export class PluginInstallController extends Context.Service<
  PluginInstallController,
  PluginInstallControllerService
>()("PluginInstallController") {}

export const PluginInstallControllerLayerRpc = Layer.effect(
  PluginInstallController,
)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => ({
      request: (input: PluginInstallRequestInput) =>
        client["app.plugin.install.request"](input).pipe(
          Effect.mapError(toLibraryError),
        ),
      status: (input: PluginInstallStatusInput) =>
        client["app.plugin.install.status"](input).pipe(
          Effect.mapError(toLibraryError),
        ),
      unlock: (pin: string) =>
        Effect.tryPromise({
          try: async () => {
            const response = await fetch("/api/install-control/session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ pin }),
            })
            if (!response.ok)
              throw new Error(`install unlock failed: ${response.status}`)
          },
          catch: error => toLibraryError(error),
        }),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}
