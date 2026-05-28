/**
 * Renderer-side `Launcher` used in the kiosk (desktop bun) where
 * `runtimeConfig.desktopInput=true`.
 *
 * Federation v1 routing:
 *
 *  - `source.isLocal !== false` (local-source or source-absent): the
 *    server is the source of truth. The renderer calls
 *    `app.library.launch` against its own server over the standard
 *    `/api/rpc` path (same as the non-kiosk `LauncherLayerRpc`),
 *    which the desktop bun forwarder hands to the loopback
 *    korri-server. The server then drives sessiond → gamescope →
 *    retroarch. No `app.desktop.launch` bridge hop is involved — that
 *    path was redundant with the server's own foreground-session
 *    launch and added a fragile Effect-RPC decoding step over a
 *    custom Hono route.
 *
 *  - `source.isLocal === false` (remote/Moonlight): the desktop bun
 *    still owns the Moonlight prepare/spawn pipeline, so we route
 *    through `app.desktop.launch` (the `LocalStreamLaunchClient`) on
 *    the in-process bridge.
 *
 * Selection between the kiosk bridge layer and the non-kiosk
 * `LauncherLayerRpc` happens at the React composition root via the
 * runtime config; see `HomeRuntimeLayersRoot`.
 */

import { appRpcGroup } from "@app/api/app-rpc-group"
import {
  createLocalStreamLaunchClient,
  type LocalStreamLaunchClient,
} from "@app/stream/local-stream-launch-client"
import type { LocalStreamLaunchResponse } from "@app/stream/local-stream-launch-rpc"
import { RpcClientLive } from "@shared/api/rpc/client"
import { launchFailureExitCode } from "@shared/library/launcher"
import {
  Launcher,
  type LaunchOptions,
  LibraryError,
} from "@shared/library/library-services"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export interface LauncherLayerBridgeOptions {
  readonly client?: LocalStreamLaunchClient
}

export function createLauncherLayerBridge(
  options: LauncherLayerBridgeOptions = {},
) {
  const moonlightClient = options.client ?? createLocalStreamLaunchClient()
  return Layer.effect(Launcher)(
    RpcClient.make(appRpcGroup).pipe(
      Effect.map(appClient => ({
        run: (
          spec: { readonly command: string },
          runOptions?: LaunchOptions,
        ) => {
          const source = runOptions?.source
          // Local-source / source-absent: server is source of truth.
          if (!source || source.isLocal !== false) {
            return appClient["app.library.launch"](
              source ? { id: spec.command, source } : { id: spec.command },
            ).pipe(Effect.mapError(toLibraryError))
          }
          // Remote-source: keep the bun-bridge Moonlight path.
          return Effect.tryPromise({
            try: async () =>
              launchResultFromResponse(
                await moonlightClient.launchGame({
                  id: spec.command,
                  source,
                }),
              ),
            catch: error =>
              new LibraryError({
                reason: "io",
                message: error instanceof Error ? error.message : String(error),
              }),
          })
        },
      })),
    ),
  ).pipe(Layer.provide(RpcClientLive))
}

export const LauncherLayerBridge = createLauncherLayerBridge()

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}

function launchResultFromResponse(response: LocalStreamLaunchResponse) {
  if (response.status === "launched") {
    return { status: "launched" as const }
  }
  if (response.status === "prepared-no-moonlight") {
    return {
      status: "failed" as const,
      exitCode: 125,
      stderrTail: response.message,
      failureKind: "moonlight-failed" as const,
    }
  }
  return {
    status: "failed" as const,
    exitCode: launchFailureExitCode(response.category),
    stderrTail: response.message,
    failureKind: response.category,
  }
}
