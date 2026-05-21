/**
 * Renderer-side `Launcher` that posts to the desktop's bun-side launch
 * bridge instead of calling `app.library.launch` via RPC.
 *
 * The bun side handles the prepare-stream RPC against the connected
 * korri-server *and* the local Moonlight spawn (see
 * `korri/deploy/desktop/launch-bridge.ts`). This layer is the desktop
 * equivalent of `LauncherLayerRpc`; pick this in `HomeServerRoot` when
 * the renderer should produce a moonlight stream instead of asking the
 * server to run a child process directly.
 *
 * The LaunchSpec.command coming in is the game id (the renderer's
 * `LibrarySource.launchSpecFor` returns an opaque
 * `{ command: id, args: [] }`). We unpack it back into `{ id }` for
 * the bridge.
 */

import { Launcher, LibraryError } from "@shared/library/library-services"
import { Effect, Layer } from "effect"

const BRIDGE_URL = "/__korri/desktop/launch"

interface BridgeFailureResponse {
  readonly status: "failed"
  readonly category:
    | "host-unavailable"
    | "host-control-disabled"
    | "no-such-game"
    | "prepare-failed"
  readonly message: string
}

interface BridgeLaunchedResponse {
  readonly status: "launched"
  readonly gameId: string
  readonly sessionId?: string
  readonly moonlightCommand: string
}

interface BridgePreparedNoMoonlightResponse {
  readonly status: "prepared-no-moonlight"
  readonly gameId: string
  readonly sessionId?: string
  readonly message: string
}

type BridgeResponse =
  | BridgeLaunchedResponse
  | BridgePreparedNoMoonlightResponse
  | BridgeFailureResponse

export const LauncherLayerBridge = Layer.succeed(Launcher)({
  run: spec =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(BRIDGE_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: spec.command }),
        })
        const body = (await response.json()) as BridgeResponse
        if (body.status === "launched") {
          return { status: "launched" as const }
        }
        if (body.status === "prepared-no-moonlight") {
          // Prepare succeeded on the server but Moonlight couldn't start
          // locally. The stream session exists; surface this as a
          // launch-failure so the UI can prompt the user to fix
          // Moonlight, but distinguish via the message.
          return {
            status: "failed" as const,
            exitCode: 125,
            stderrTail: body.message,
          }
        }
        // body.status === "failed"
        return {
          status: "failed" as const,
          exitCode: exitCodeForCategory(body.category),
          stderrTail: body.message,
        }
      },
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
})

function exitCodeForCategory(
  category: BridgeFailureResponse["category"],
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
  }
}
