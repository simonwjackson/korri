import { RpcClientLive } from "@platform/api/rpc/client"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError, LibrarySource } from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export const LibrarySourceLayerRpc = Layer.effect(LibrarySource)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => {
      const readPlayableEntries = () =>
        client["app.catalog.snapshot"]({ scope: "fabric" }).pipe(
          Effect.map(response => response.entries),
          Effect.catchCause(cause => Effect.fail(toLibraryError(cause))),
        )

      return {
        list: () =>
          readPlayableEntries().pipe(
            Effect.map(entries => entries.map(playableToCompatGame)),
          ),
        listPlayableEntries: () => readPlayableEntries(),
        launchSpecFor: (id: string, releaseId?: string) =>
          Effect.succeed(
            opaqueLaunchSpecFor(releaseId ? `${id}#${releaseId}` : id),
          ),
        resolveLaunchForGame: (id: string) =>
          Effect.succeed({ spec: opaqueLaunchSpecFor(id) }),
      }
    }),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}

function opaqueLaunchSpecFor(id: string): LaunchSpec {
  return {
    command: id,
    args: [],
  }
}

function playableToCompatGame(entry: PlayableLibraryEntry): ResolvedGameRecord {
  const release = entry.releases[0]
  return {
    id: entry.id,
    system: release?.system ?? entry.system ?? "unknown",
    metadata: { name: entry.title ?? entry.id },
    ...(entry.media ? { media: entry.media } : {}),
  }
}
