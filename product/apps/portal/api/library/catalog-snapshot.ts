import { makeLocalEntrySource } from "@platform/api/rpc/entry-source"
import { DataError } from "@platform/api/rpc/errors"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import {
  type LibraryError,
  LibrarySource,
  type LibrarySourceService,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { logger } from "@platform/logger/logger"
import {
  catalogPeerFromRecord,
  type CatalogPeerState,
  makeSelfCatalogPeer,
} from "@product/apps/portal/peers/catalog-peer-state"
import { PeerDiscovery, type PeerRecord } from "@product/apps/portal/peers/peer-discovery"
import {
  PeerSourceFetcher,
  type PeerSourceFetcherService,
} from "@product/apps/portal/peers/peer-source-fetcher"
import { Context, Effect, Layer, Ref, Scope, SubscriptionRef } from "effect"
import type { LibraryEntry } from "./list.rpc"
import {
  CatalogHealthSummary,
  CatalogPeerSnapshot,
  LibrarySnapshotResponse,
} from "./snapshot.rpc"

export interface CatalogSnapshotService {
  readonly getSnapshot: () => Effect.Effect<LibrarySnapshotResponse, DataError>
}

export class CatalogSnapshot extends Context.Service<
  CatalogSnapshot,
  CatalogSnapshotService
>()("CatalogSnapshot") {}

export const CatalogSnapshotLive: Layer.Layer<
  CatalogSnapshot,
  never,
  LibrarySource | PeerDiscovery | PeerSourceFetcher
> = Layer.effect(CatalogSnapshot)(
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const peerDiscovery = yield* PeerDiscovery
    const peerFetcher = yield* PeerSourceFetcher
    const remoteEntries = yield* Ref.make<
      ReadonlyMap<string, readonly LibraryEntry[]>
    >(new Map())
    const remotePeerStates = yield* Ref.make<
      ReadonlyMap<string, CatalogPeerState>
    >(new Map())
    const generation = yield* Ref.make(0)
    const refreshing = yield* Ref.make(false)
    const refreshScope = Scope.makeUnsafe()

    const triggerRemoteRefresh = (peers: readonly PeerRecord[]) =>
      Effect.gen(function* () {
        const alreadyRefreshing = yield* Ref.modify(refreshing, current => [
          current,
          true,
        ] as const)
        if (alreadyRefreshing) return
        yield* refreshRemotePeers({
          peers,
          peerFetcher,
          remoteEntries,
          remotePeerStates,
          generation,
          refreshing,
        }).pipe(Effect.forkIn(refreshScope))
      })

    return {
      getSnapshot: () =>
        Effect.gen(function* () {
          const entries = yield* listLocalEntries(source).pipe(
            Effect.mapError(toDataError),
          )
          const localSource = makeLocalEntrySource(process.env)
          const localTagged: readonly LibraryEntry[] = entries.map(entry => ({
            ...entry,
            source: localSource,
          }))

          const now = new Date().toISOString()
          const peerSnapshot = yield* SubscriptionRef.get(peerDiscovery.peers)
          const peers = Array.from(peerSnapshot.values())
          const peerKeys = new Set(peers.map(peer => peer.controlUrl))

          yield* Ref.update(remotePeerStates, current => {
            const next = new Map<string, CatalogPeerState>()
            for (const peer of peers) {
              const existing = current.get(peer.controlUrl)
              next.set(
                peer.controlUrl,
                existing ??
                  catalogPeerFromRecord(peer, {
                    status: "loading",
                    entryCount: 0,
                    updatedAt: now,
                  }),
              )
            }
            return next
          })
          yield* Ref.update(remoteEntries, current => {
            const next = new Map(current)
            for (const key of next.keys()) {
              if (!peerKeys.has(key)) next.delete(key)
            }
            return next
          })

          yield* triggerRemoteRefresh(peers)

          const remoteEntriesSnapshot = yield* Ref.get(remoteEntries)
          const remotePeerSnapshot = yield* Ref.get(remotePeerStates)
          // Every emitted snapshot receives a fresh generation so renderers
          // can safely reconcile local/self changes and peer disappearances,
          // not just remote fetch completions.
          const currentGeneration = yield* Ref.updateAndGet(
            generation,
            value => value + 1,
          )
          const remoteTagged = peers.flatMap(
            peer => remoteEntriesSnapshot.get(peer.controlUrl) ?? [],
          )
          const selfPeer = makeSelfCatalogPeer({
            env: process.env,
            entryCount: localTagged.length,
            updatedAt: now,
          })
          const peerStates = [
            selfPeer,
            ...peers.map(peer =>
              remotePeerSnapshot.get(peer.controlUrl) ??
              catalogPeerFromRecord(peer, {
                status: "loading",
                entryCount: 0,
                updatedAt: now,
              }),
            ),
          ]

          return new LibrarySnapshotResponse({
            entries: [...localTagged, ...remoteTagged],
            peers: peerStates.map(toPeerSnapshot),
            generation: currentGeneration,
            updatedAt: now,
            health: toHealth(peerStates, currentGeneration),
          })
        }),
    }
  }),
)

function refreshRemotePeers(options: {
  readonly peers: readonly PeerRecord[]
  readonly peerFetcher: PeerSourceFetcherService
  readonly remoteEntries: Ref.Ref<ReadonlyMap<string, readonly LibraryEntry[]>>
  readonly remotePeerStates: Ref.Ref<ReadonlyMap<string, CatalogPeerState>>
  readonly generation: Ref.Ref<number>
  readonly refreshing: Ref.Ref<boolean>
}) {
  return Effect.all(
    options.peers.map(peer =>
      options.peerFetcher.fetchPeerCatalogResult(peer).pipe(
        Effect.flatMap(result => {
          const updatedAt = new Date().toISOString()
          const state = catalogPeerFromRecord(peer, {
            status: result.status,
            entryCount: result.entries.length,
            updatedAt,
            ...(result.status === "failed" ? { error: result.error } : {}),
          })
          return Effect.all([
            Ref.update(options.remoteEntries, current => {
              const next = new Map(current)
              if (result.status === "ready") {
                next.set(peer.controlUrl, result.entries)
              } else {
                next.delete(peer.controlUrl)
              }
              return next
            }),
            Ref.update(options.remotePeerStates, current => {
              const next = new Map(current)
              next.set(peer.controlUrl, state)
              return next
            }),
            Ref.update(options.generation, value => value + 1),
          ])
        }),
      ),
    ),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.catchCause(cause =>
      Effect.sync(() => {
        logger.warn(
          { error: String(cause) },
          "app.library.snapshot: remote refresh failed",
        )
      }),
    ),
    Effect.ensuring(Ref.set(options.refreshing, false)),
  )
}

function listLocalEntries(source: LibrarySourceService) {
  return source.listPlayableEntries
    ? source.listPlayableEntries()
    : source.list().pipe(
        Effect.map(games => games.map(gameToPlayableEntry)),
      )
}

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
  logger.error({ error: message }, "app.library.snapshot: source.list() rejected")
  return new DataError({
    reason: "ReadFailed",
    message,
  })
}

function toPeerSnapshot(peer: CatalogPeerState): CatalogPeerSnapshot {
  return new CatalogPeerSnapshot({
    hostId: peer.hostId,
    displayName: peer.displayName,
    controlUrl: peer.controlUrl,
    isLocal: peer.isLocal,
    caps: [...peer.caps],
    status: peer.status,
    entryCount: peer.entryCount,
    updatedAt: peer.updatedAt,
    ...(peer.error ? { error: peer.error } : {}),
  })
}

function toHealth(
  peers: readonly CatalogPeerState[],
  generation: number,
): CatalogHealthSummary {
  const remotePeers = peers.filter(peer => !peer.isLocal)
  const self = peers.find(peer => peer.isLocal)
  const lastFailure = [...remotePeers]
    .reverse()
    .find(peer => peer.status === "failed" && peer.error)?.error

  return new CatalogHealthSummary({
    coordinatorReachable: true,
    self: self?.status ?? "failed",
    loadingPeers: remotePeers.filter(peer => peer.status === "loading").length,
    readyPeers: remotePeers.filter(peer => peer.status === "ready").length,
    failedPeers: remotePeers.filter(peer => peer.status === "failed").length,
    ...(lastFailure ? { lastFailure } : {}),
    generation,
  })
}
