import { makeLocalEntrySource } from "@platform/api/rpc/entry-source"
import { DataError } from "@platform/api/rpc/errors"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import {
  type LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { logger } from "@platform/logger/logger"
import { PeerDiscovery } from "@product/apps/portal/peers/peer-discovery"
import { PeerSourceFetcher } from "@product/apps/portal/peers/peer-source-fetcher"
import { Effect, SubscriptionRef } from "effect"

import {
  type LibraryEntry,
  type ListLibraryPayload,
  ListLibraryResponse,
} from "./list.rpc"

/**
 * Returns playable library entries from the local source plus remote peers.
 * Entries are keyed by playable id and include ordered release metadata; the
 * launch layer applies release-aware selection rules.
 */
export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const entries = yield* (
      source.listPlayableEntries
        ? source.listPlayableEntries()
        : source
            .list()
            .pipe(Effect.map(games => games.map(gameToPlayableEntry)))
    ).pipe(Effect.mapError(toDataError))
    const localSource = makeLocalEntrySource(process.env)
    const localTagged: readonly LibraryEntry[] = entries.map(entry => ({
      ...entry,
      source: localSource,
    }))

    const peerDiscovery = yield* PeerDiscovery
    const peerFetcher = yield* PeerSourceFetcher
    const peerSnapshot = yield* SubscriptionRef.get(peerDiscovery.peers)
    const peers = Array.from(peerSnapshot.values())
    const remoteResults = yield* Effect.all(
      peers.map(peer => peerFetcher.fetchPeerCatalog(peer)),
      { concurrency: "unbounded" },
    )
    const remoteTagged = remoteResults.flat()

    return new ListLibraryResponse({
      games: [...localTagged, ...remoteTagged],
    })
  })

function gameToPlayableEntry(game: ResolvedGameRecord): PlayableLibraryEntry {
  return {
    id: game.id,
    itemId: game.id,
    title: game.metadata?.name ?? game.id,
    releases: [
      {
        id: "default",
        system: game.system,
        launchable:
          game.contentPath !== undefined || game.content !== undefined,
        ...(game.contentPath !== undefined ? { target: game.contentPath } : {}),
      },
    ],
    launchable: game.contentPath !== undefined || game.content !== undefined,
    metadata: game.metadata,
  }
}

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library list failed"
  logger.error({ error: message }, "app.library.list: source.list() rejected")
  return new DataError({
    reason: "ReadFailed",
    message,
  })
}
