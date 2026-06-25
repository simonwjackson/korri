import { makeLocalEntrySource } from "@platform/api/rpc/entry-source"
import {
  LibrarySource,
  type LibrarySourceService,
} from "@platform/library/library-services"
import { playableEntryFromResolvedGame } from "@platform/library/playable-library"
import { logger } from "@platform/logger/logger"
import {
  type CatalogPeerState,
  catalogPeerFromRecord,
  makeSelfCatalogPeer,
} from "@product/apps/portal/peers/catalog-peer-state"
import {
  PeerDiscovery,
  type PeerRecord,
} from "@product/apps/portal/peers/peer-discovery"
import {
  PeerSourceFetcher,
  type PeerSourceFetcherService,
} from "@product/apps/portal/peers/peer-source-fetcher"
import {
  Context,
  Duration,
  Effect,
  Layer,
  Ref,
  Scope,
  SubscriptionRef,
} from "effect"
import { foldCatalogEntries } from "./fold-catalog-entries"
import {
  type CatalogEntry,
  CatalogHealthSummary,
  CatalogPeerSnapshot,
  CatalogSnapshotResponse,
  type CatalogSnapshotScope,
} from "./snapshot.rpc"

const DEFAULT_LOCAL_CATALOG_TIMEOUT_MS = 15_000

interface CatalogSnapshotService {
  readonly getSnapshot: (
    scope?: CatalogSnapshotScope,
  ) => Effect.Effect<CatalogSnapshotResponse, never>
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
      ReadonlyMap<string, readonly CatalogEntry[]>
    >(new Map())
    const remotePeerStates = yield* Ref.make<
      ReadonlyMap<string, CatalogPeerState>
    >(new Map())
    const generation = yield* Ref.make(0)
    const refreshing = yield* Ref.make(false)
    const refreshScope = Scope.makeUnsafe()

    const triggerRemoteRefresh = (peers: readonly PeerRecord[]) =>
      Effect.gen(function* () {
        const alreadyRefreshing = yield* Ref.modify(
          refreshing,
          current => [current, true] as const,
        )
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
      getSnapshot: (scope = "fabric") =>
        Effect.gen(function* () {
          const now = new Date().toISOString()
          const localSource = makeLocalEntrySource(process.env)
          const localResult = yield* listLocalEntries(source).pipe(
            Effect.timeout(Duration.millis(localCatalogTimeoutMs())),
            Effect.match({
              onFailure: error => ({ _tag: "Failed" as const, error }),
              onSuccess: entries => ({ _tag: "Ready" as const, entries }),
            }),
          )
          const localTagged: readonly CatalogEntry[] =
            localResult._tag === "Ready"
              ? localResult.entries.map(entry => ({
                  ...entry,
                  source: localSource,
                }))
              : []
          const selfPeer = makeSelfCatalogPeer({
            env: process.env,
            entryCount: localTagged.length,
            updatedAt: now,
            status: localResult._tag === "Ready" ? "ready" : "failed",
            ...(localResult._tag === "Failed"
              ? { error: sanitizeCatalogError(localResult.error) }
              : {}),
          })

          if (localResult._tag === "Failed") {
            logger.error(
              { error: catalogErrorMessage(localResult.error) },
              "app.catalog.snapshot: source rejected",
            )
          }

          if (scope === "self") {
            const currentGeneration = yield* Ref.updateAndGet(
              generation,
              value => value + 1,
            )
            const peers = [selfPeer]
            return new CatalogSnapshotResponse({
              entries: localTagged,
              peers: peers.map(toPeerSnapshot),
              generation: currentGeneration,
              updatedAt: now,
              health: toHealth(peers, currentGeneration),
            })
          }

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
          const currentGeneration = yield* Ref.updateAndGet(
            generation,
            value => value + 1,
          )
          const remoteTagged = peers.flatMap(
            peer => remoteEntriesSnapshot.get(peer.controlUrl) ?? [],
          )
          const peerStates = [
            selfPeer,
            ...peers.map(
              peer =>
                remotePeerSnapshot.get(peer.controlUrl) ??
                catalogPeerFromRecord(peer, {
                  status: "loading",
                  entryCount: 0,
                  updatedAt: now,
                }),
            ),
          ]

          const foldedEntries = foldCatalogEntries({
            entries: [...localTagged, ...remoteTagged],
            presentPeerControlUrls: peerKeys,
          })

          return new CatalogSnapshotResponse({
            entries: foldedEntries,
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
  readonly remoteEntries: Ref.Ref<ReadonlyMap<string, readonly CatalogEntry[]>>
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
    { concurrency: 4 },
  ).pipe(
    Effect.catchCause(cause =>
      Effect.sync(() => {
        logger.warn(
          { error: String(cause) },
          "app.catalog.snapshot: remote refresh failed",
        )
      }),
    ),
    Effect.ensuring(Ref.set(options.refreshing, false)),
  )
}

function listLocalEntries(source: LibrarySourceService) {
  return source.listPlayableEntries
    ? source.listPlayableEntries()
    : source
        .list()
        .pipe(Effect.map(games => games.map(playableEntryFromResolvedGame)))
}

function localCatalogTimeoutMs(): number {
  const raw = process.env.KORRI_CATALOG_SELF_TIMEOUT_MS
  if (raw === undefined) return DEFAULT_LOCAL_CATALOG_TIMEOUT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LOCAL_CATALOG_TIMEOUT_MS
}

function catalogErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error)
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message ?? error)
  }
  return String(error)
}

function sanitizeCatalogError(error: unknown): string {
  const message = catalogErrorMessage(error)
  return message.replace(/\/[\w./-]+/g, "[path]").slice(0, 240)
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
