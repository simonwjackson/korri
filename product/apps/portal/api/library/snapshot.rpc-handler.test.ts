import { describe, expect, it } from "bun:test"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import { CatalogSnapshotLive } from "@product/apps/portal/api/library/catalog-snapshot"
import { PeerDiscovery, type PeerRecord } from "@product/apps/portal/peers/peer-discovery"
import {
  makePeerSourceFetcherLive,
  type PeerSourceCatalogEntry,
  PeerSourceFetcher,
} from "@product/apps/portal/peers/peer-source-fetcher"
import { Effect, Layer, SubscriptionRef } from "effect"
import { handleLibrarySnapshot } from "./snapshot.rpc-handler"

describe("app.library.snapshot", () => {
  it("returns self entries immediately with remote peers marked loading", async () => {
    const slowPeer: PeerRecord = {
      hostId: "aka",
      displayName: "aka",
      controlUrl: "http://aka:3001",
      caps: ["source"],
    }
    const layer = snapshotLayerWith({
      peers: [slowPeer],
      peerCatalogs: {
        [slowPeer.controlUrl]: [
          { id: "remote/game", displayName: "Remote Game", streamable: true },
        ],
      },
      peerCatalogDelaysMs: { [slowPeer.controlUrl]: 100 },
    })

    const snapshot = await Effect.runPromise(
      handleLibrarySnapshot({}).pipe(Effect.provide(layer)),
    )

    expect(snapshot.entries.map(entry => entry.id)).toEqual(["local/stray"])
    expect(snapshot.peers.find(peer => peer.isLocal)).toMatchObject({
      hostId: expect.any(String),
      status: "ready",
      entryCount: 1,
    })
    expect(snapshot.peers.find(peer => peer.hostId === "aka")).toMatchObject({
      status: "loading",
      entryCount: 0,
    })
    expect(snapshot.health.loadingPeers).toBe(1)
  })

  it("adds remote entries and health after peer refresh completes", async () => {
    const aka: PeerRecord = {
      hostId: "aka",
      displayName: "aka",
      controlUrl: "http://aka:3001",
      caps: ["source"],
    }
    const layer = snapshotLayerWith({
      peers: [aka],
      peerCatalogs: {
        [aka.controlUrl]: [
          { id: "remote/game", displayName: "Remote Game", streamable: true },
        ],
      },
    })

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        yield* handleLibrarySnapshot({})
        yield* Effect.sleep("10 millis")
        return yield* handleLibrarySnapshot({})
      }).pipe(Effect.provide(layer)),
    )

    expect(snapshot.entries.map(entry => entry.id).sort()).toEqual([
      "local/stray",
      "remote/game",
    ])
    expect(snapshot.peers.find(peer => peer.hostId === "aka")).toMatchObject({
      status: "ready",
      entryCount: 1,
    })
    expect(snapshot.health.readyPeers).toBe(1)
  })

  it("keeps self entries and reports failed peer health", async () => {
    const dead: PeerRecord = {
      hostId: "dead",
      displayName: "dead",
      controlUrl: "http://dead:3001",
      caps: ["source"],
    }
    const layer = snapshotLayerWith({ peers: [dead], peerCatalogs: {} })

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        yield* handleLibrarySnapshot({})
        yield* Effect.sleep("10 millis")
        return yield* handleLibrarySnapshot({})
      }).pipe(Effect.provide(layer)),
    )

    expect(snapshot.entries.map(entry => entry.id)).toEqual(["local/stray"])
    expect(snapshot.peers.find(peer => peer.hostId === "dead")).toMatchObject({
      status: "failed",
      entryCount: 0,
    })
    expect(snapshot.health.failedPeers).toBe(1)
    expect(snapshot.health.lastFailure).toContain("unreachable peer")
  })
})

function snapshotLayerWith(options: {
  readonly peers: readonly PeerRecord[]
  readonly peerCatalogs: Readonly<
    Record<string, readonly PeerSourceCatalogEntry[]>
  >
  readonly peerCatalogDelaysMs?: Readonly<Record<string, number>>
}) {
  const sourceLayer = makeInMemoryLibrarySourceLayer({
    games: [
      {
        id: "local/stray",
        system: "steam",
        contentPath: "/storage/steam/stray",
        metadata: { name: "Stray" },
      },
    ],
  })
  const peersLayer = Layer.effect(PeerDiscovery)(
    Effect.gen(function* () {
      const peers = yield* SubscriptionRef.make<
        ReadonlyMap<string, PeerRecord>
      >(new Map(options.peers.map(peer => [peer.controlUrl, peer] as const)))
      return { peers }
    }),
  )
  const fetcherLayer = Layer.succeed(PeerSourceFetcher)(
    makePeerSourceFetcherLive({
      createClient: controlUrl => ({
        listSourceGames: async () => {
          const delay = options.peerCatalogDelaysMs?.[controlUrl] ?? 0
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
          const catalog = options.peerCatalogs[controlUrl]
          if (!catalog) throw new Error(`unreachable peer: ${controlUrl}`)
          return catalog
        },
      }),
      timeoutMs: 0,
    }),
  )

  const dependencies = Layer.mergeAll(sourceLayer, peersLayer, fetcherLayer)
  return CatalogSnapshotLive.pipe(Layer.provide(dependencies))
}
