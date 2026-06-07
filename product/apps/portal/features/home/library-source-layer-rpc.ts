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
    Effect.map(client => ({
      list: () =>
        client["app.library.list"]({}).pipe(
          Effect.map(response => response.games.map(playableToCompatGame)),
          Effect.catchCause(cause =>
            isNoUpstreamCause(cause)
              ? Effect.succeed([])
              : Effect.fail(toLibraryError(cause)),
          ),
        ),
      listPlayableEntries: () =>
        client["app.library.list"]({}).pipe(
          Effect.map(response => response.games),
          Effect.catchCause(cause =>
            isNoUpstreamCause(cause)
              ? Effect.succeed([])
              : Effect.fail(toLibraryError(cause)),
          ),
        ),
      launchSpecFor: (id: string, releaseId?: string) =>
        Effect.succeed(
          opaqueLaunchSpecFor(releaseId ? `${id}#${releaseId}` : id),
        ),
      resolveLaunchForGame: (id: string) =>
        Effect.succeed({ spec: opaqueLaunchSpecFor(id) }),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toLibraryError(error: unknown): LibraryError {
  return new LibraryError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}

function isNoUpstreamCause(cause: unknown): boolean {
  const rendered = String(cause)
  return rendered.includes("no upstream") || rendered.includes("503")
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
