import { describe, expect, it } from "bun:test"
import {
  loadingForeverLibrarySourceLayer,
  makeInMemoryLibrarySourceLayer,
} from "@platform/library/library-source-layer-memory"
import { CatalogSnapshotLive } from "@product/apps/portal/api/catalog/catalog-snapshot"
import {
  PeerDiscovery,
  type PeerRecord,
} from "@product/apps/portal/peers/peer-discovery"
import {
  makePeerSourceFetcherLive,
  type PeerSourceCatalogEntry,
  PeerSourceFetcher,
} from "@product/apps/portal/peers/peer-source-fetcher"
import { Effect, Layer, SubscriptionRef } from "effect"
import { handleCatalogSnapshot } from "./snapshot.rpc-handler"

describe("app.catalog.snapshot", () => {
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
        [slowPeer.controlUrl]: [peerEntry("remote/game", "Remote Game")],
      },
      peerCatalogDelaysMs: { [slowPeer.controlUrl]: 100 },
    })

    const snapshot = await Effect.runPromise(
      handleCatalogSnapshot({ scope: "fabric" }).pipe(Effect.provide(layer)),
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

  it("bounds a hung self catalog as failed facts", async () => {
    const originalTimeout = process.env.KORRI_CATALOG_SELF_TIMEOUT_MS
    process.env.KORRI_CATALOG_SELF_TIMEOUT_MS = "50"
    try {
      const layer = snapshotLayerWith({
        peers: [],
        peerCatalogs: {},
        sourceLayer: loadingForeverLibrarySourceLayer,
      })

      const started = Date.now()
      const snapshot = await Effect.runPromise(
        handleCatalogSnapshot({ scope: "self" }).pipe(Effect.provide(layer)),
      )

      expect(Date.now() - started).toBeLessThan(500)
      expect(snapshot.health.self).toBe("failed")
      expect(snapshot.peers[0]).toMatchObject({
        isLocal: true,
        status: "failed",
      })
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.KORRI_CATALOG_SELF_TIMEOUT_MS
      } else {
        process.env.KORRI_CATALOG_SELF_TIMEOUT_MS = originalTimeout
      }
    }
  })

  it("does not fan out remote peers for self-only snapshots", async () => {
    const aka: PeerRecord = {
      hostId: "aka",
      displayName: "aka",
      controlUrl: "http://aka:3001",
      caps: ["source"],
    }
    let fetches = 0
    const layer = snapshotLayerWith({
      peers: [aka],
      peerCatalogs: { [aka.controlUrl]: [] },
      onFetch: () => {
        fetches += 1
      },
    })

    const snapshot = await Effect.runPromise(
      handleCatalogSnapshot({ scope: "self" }).pipe(Effect.provide(layer)),
    )

    expect(fetches).toBe(0)
    expect(snapshot.entries.map(entry => entry.id)).toEqual(["local/stray"])
    expect(snapshot.peers).toHaveLength(1)
    expect(snapshot.peers[0]).toMatchObject({ isLocal: true, status: "ready" })
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
        [aka.controlUrl]: [peerEntry("remote/game", "Remote Game")],
      },
    })

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        yield* handleCatalogSnapshot({ scope: "fabric" })
        yield* Effect.sleep("10 millis")
        return yield* handleCatalogSnapshot({ scope: "fabric" })
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
        yield* handleCatalogSnapshot({ scope: "fabric" })
        yield* Effect.sleep("10 millis")
        return yield* handleCatalogSnapshot({ scope: "fabric" })
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

function peerEntry(id: string, title: string): PeerSourceCatalogEntry {
  return {
    id,
    itemId: id,
    title,
    displayName: title,
    streamable: true,
    system: "remote",
    releases: [
      {
        id: "remote",
        system: "remote",
        launchable: true,
        apps: ["moonlight"],
      },
    ],
    launchable: true,
    metadata: { name: title },
    source: {
      hostId: "peer",
      controlUrl: "http://peer:3001",
      isLocal: true,
    },
  }
}

function snapshotLayerWith(options: {
  readonly peers: readonly PeerRecord[]
  readonly peerCatalogs: Readonly<
    Record<string, readonly PeerSourceCatalogEntry[]>
  >
  readonly peerCatalogDelaysMs?: Readonly<Record<string, number>>
  readonly onFetch?: () => void
  readonly sourceLayer?: ReturnType<typeof makeInMemoryLibrarySourceLayer>
}) {
  const sourceLayer =
    options.sourceLayer ??
    makeInMemoryLibrarySourceLayer({
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
          options.onFetch?.()
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
