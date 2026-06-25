import { describe, expect, it } from "bun:test"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { CatalogSnapshotLive } from "@product/apps/portal/api/catalog/catalog-snapshot"
import { handleCatalogSnapshot } from "@product/apps/portal/api/catalog/snapshot.rpc-handler"
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
import { Hono } from "hono"
import { cors } from "hono/cors"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"

const sharedIdentity = {
  kind: "provider" as const,
  value: { provider: "@korri:steam", ref: "1029210" },
}

describe("federated catalog folding integration", () => {
  it("fetches a peer catalog over a real loopback server and folds it with local entries", async () => {
    await using peerServer = await withRpcServer({
      fetch: peerCatalogHttpApp([
        peerSourceEntry("peer/f-zero", "Peer F-Zero", sharedIdentity),
      ]).fetch,
    })

    const peer: PeerRecord = {
      hostId: "aka",
      displayName: "aka",
      controlUrl: peerServer.url,
      caps: ["source"],
    }
    const layer = coordinatorLayer({
      peers: [peer],
      localEntries: [
        playableEntry("local/f-zero", "Local F-Zero", sharedIdentity),
      ],
    })

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        let latest = yield* handleCatalogSnapshot({ scope: "fabric" })
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (
            latest.peers.find(item => item.hostId === "aka")?.status === "ready"
          ) {
            return latest
          }
          yield* Effect.sleep("25 millis")
          latest = yield* handleCatalogSnapshot({ scope: "fabric" })
        }
        return latest
      }).pipe(Effect.provide(layer)),
    )

    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]).toMatchObject({
      id: "local/f-zero",
      title: "Local F-Zero",
      source: { isLocal: true },
      availability: "local-launchable",
    })
    expect(snapshot.peers.find(item => item.hostId === "aka")).toMatchObject({
      status: "ready",
      entryCount: 1,
    })
  })
})

function peerCatalogHttpApp(entries: readonly PeerSourceCatalogEntry[]) {
  const app = new Hono()
  app.use("/*", cors({ origin: "*" }))
  app.get("/catalog-self", c => c.json(entries))
  return app
}

function playableEntry(
  id: string,
  title: string,
  identity: PlayableLibraryEntry["releases"][number]["identity"],
): PlayableLibraryEntry {
  return {
    id,
    itemId: id,
    title,
    releases: [
      {
        id: "default",
        system: "snes",
        identity,
        launchable: true,
        launch: { use: "default" },
      },
    ],
    launchable: true,
    metadata: { name: title },
  }
}

function peerSourceEntry(
  id: string,
  title: string,
  identity: PlayableLibraryEntry["releases"][number]["identity"],
): PeerSourceCatalogEntry {
  return {
    ...playableEntry(id, title, identity),
    source: {
      hostId: "peer",
      controlUrl: "http://peer.invalid",
      isLocal: true,
    },
    displayName: title,
    streamable: true,
  }
}

function coordinatorLayer(options: {
  readonly peers: readonly PeerRecord[]
  readonly localEntries: readonly PlayableLibraryEntry[]
}) {
  const sourceLayer = makeInMemoryLibrarySourceLayer({
    playableEntries: options.localEntries,
  })
  const peersLayer = Layer.effect(PeerDiscovery)(
    Effect.gen(function* () {
      const peers = yield* SubscriptionRef.make<
        ReadonlyMap<string, PeerRecord>
      >(new Map(options.peers.map(peer => [peer.controlUrl, peer] as const)))
      return { peers }
    }),
  )
  const fetcherLayer = Layer.succeed(
    PeerSourceFetcher,
    makePeerSourceFetcherLive({
      createClient: controlUrl => ({
        listSourceGames: async () => {
          const response = await fetch(`${controlUrl}/catalog-self`)
          if (!response.ok) throw new Error(`peer failed: ${response.status}`)
          return (await response.json()) as readonly PeerSourceCatalogEntry[]
        },
      }),
      timeoutMs: 1000,
    }),
  )
  return CatalogSnapshotLive.pipe(
    Layer.provide(Layer.mergeAll(sourceLayer, peersLayer, fetcherLayer)),
  )
}
