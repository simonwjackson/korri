import { RpcClientLive } from "@platform/api/rpc/client"
import {
  Launcher,
  type LaunchOptions,
  LibraryError,
} from "@platform/library/library-services"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

/**
 * Renderer-side `Launcher` that talks to `app.library.launch` over the
 * standard `/api/rpc` path. Threads `LaunchOptions.source` through to the
 * server so federation routing (source-tagged remote entries) reaches the
 * server's handler. The server then dispatches local vs. Moonlight launches
 * through the same `ForegroundSessionHost` / `Launcher` seam terminating in
 * sessiond.
 *
 * Used by every composition root after the bun launch-bridge deletion. The
 * desktop/kiosk and portal/non-kiosk deploys both seed this layer.
 */
export const LauncherLayerRpc = Layer.effect(Launcher)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => ({
      run: (spec: { readonly command: string }, options?: LaunchOptions) => {
        const source = options?.source
        const launchAlternatives = options?.launchAlternatives
        return client["app.library.launch"]({
          id: spec.command,
          ...(source ? { source } : {}),
          ...(launchAlternatives !== undefined
            ? { launchAlternatives: [...launchAlternatives] }
            : {}),
        }).pipe(Effect.mapError(toLibraryError))
      },
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}
