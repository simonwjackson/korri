/**
 * Renderer-side `Launcher` that calls the desktop bun-side launch RPC
 * instead of calling `app.library.launch` via the remote API.
 *
 * The bun side handles the prepare-stream RPC against the connected
 * korri-server *and* the local Moonlight spawn (see
 * `korri/deploy/desktop/launch-bridge.ts`). This layer is the desktop
 * equivalent of `LauncherLayerRpc`; selection between the two happens
 * once at the React composition root (`korri/deploy/portal/main.tsx`)
 * via `selectLauncherLayer(runtimeConfig)` and the layer is seeded into
 * the atom registry through `<RegistryProvider initialValues={…}>`.
 *
 * The LaunchSpec.command coming in is the game id (the renderer's
 * `LibrarySource.launchSpecFor` returns an opaque
 * `{ command: id, args: [] }`). We unpack it back into `{ id }` for
 * the local launch RPC.
 */

import {
  createLocalStreamLaunchClient,
  type LocalStreamLaunchClient,
} from "@app/stream/local-stream-launch-client"
import type { LocalStreamLaunchResponse } from "@app/stream/local-stream-launch-rpc"
import { Launcher, LibraryError } from "@shared/library/library-services"
import { Effect, Layer } from "effect"

export interface LauncherLayerBridgeOptions {
  readonly client?: LocalStreamLaunchClient
}

export function createLauncherLayerBridge(
  options: LauncherLayerBridgeOptions = {},
) {
  const client = options.client ?? createLocalStreamLaunchClient()
  return Layer.succeed(Launcher)({
    run: spec =>
      Effect.tryPromise({
        try: async () =>
          launchResultFromResponse(await client.launchGame(spec.command)),
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })
}

export const LauncherLayerBridge = createLauncherLayerBridge()

function launchResultFromResponse(response: LocalStreamLaunchResponse) {
  if (response.status === "launched") {
    return { status: "launched" as const }
  }
  if (response.status === "prepared-no-moonlight") {
    // Prepare succeeded on the server but Moonlight couldn't start locally.
    // The stream session exists; surface this as a launch-failure so the UI
    // can prompt the user to fix Moonlight, but distinguish via the message.
    return {
      status: "failed" as const,
      exitCode: 125,
      stderrTail: response.message,
      failureKind: "moonlight-failed" as const,
    }
  }
  return {
    status: "failed" as const,
    exitCode: exitCodeForCategory(response.category),
    stderrTail: response.message,
    failureKind: response.category,
  }
}

function exitCodeForCategory(
  category: Extract<
    LocalStreamLaunchResponse,
    { readonly status: "failed" }
  >["category"],
): number {
  switch (category) {
    case "host-unavailable":
      return 124
    case "host-control-disabled":
      return 126
    case "no-such-game":
      return 127
    case "prepare-failed":
      return 1
    case "input-unavailable":
      return 123
    case "input-ambiguous":
      return 122
    case "session-busy":
      return 121
  }
}
