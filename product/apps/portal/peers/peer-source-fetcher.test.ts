import { describe, expect, it } from "bun:test"
import {
  makePeerSourceFetcherLive,
  type PeerRecord,
  type PeerSourceCatalogEntry,
} from "@product/apps/portal/peers/peer-source-fetcher"
import { Effect } from "effect"

describe("PeerSourceFetcherLive", () => {
  it("returns the peer's catalog tagged with that peer's source identity", async () => {
    const peer: PeerRecord = {
      hostId: "sobo",
      controlUrl: "http://sobo.invalid:3001",
      displayName: "sobo",
      caps: ["source"],
    }

    const catalog: readonly PeerSourceCatalogEntry[] = [
      {
        id: "pico-8/celeste",
        displayName: "Celeste",
        streamable: true,
      },
    ]

    const fetcher = makePeerSourceFetcherLive({
      // Inject a stub client factory so we don't hit the network.
      createClient: () => ({
        listSourceGames: async () => catalog,
      }),
      timeoutMs: 100,
    })

    const entries = await Effect.runPromise(fetcher.fetchPeerCatalog(peer))

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: "pico-8/celeste",
      system: "remote",
      source: {
        hostId: "sobo",
        controlUrl: "http://sobo.invalid:3001",
        isLocal: false,
      },
    })
    expect(entries[0]?.metadata?.name).toBe("Celeste")
  })

  it("returns [] when the peer client throws (partial failure tolerance)", async () => {
    const peer: PeerRecord = {
      hostId: "broken",
      controlUrl: "http://broken.invalid:3001",
      displayName: "broken",
      caps: ["source"],
    }

    const fetcher = makePeerSourceFetcherLive({
      createClient: () => ({
        listSourceGames: async () => {
          throw new Error("ECONNREFUSED")
        },
      }),
      timeoutMs: 100,
    })

    const entries = await Effect.runPromise(fetcher.fetchPeerCatalog(peer))
    expect(entries).toEqual([])
  })

  it("returns [] when the peer client exceeds the per-peer timeout", async () => {
    const peer: PeerRecord = {
      hostId: "slow",
      controlUrl: "http://slow.invalid:3001",
      displayName: "slow",
      caps: ["source"],
    }

    const fetcher = makePeerSourceFetcherLive({
      createClient: () => ({
        listSourceGames: () => new Promise(() => {}), // never resolves
      }),
      timeoutMs: 50,
    })

    const start = Date.now()
    const entries = await Effect.runPromise(fetcher.fetchPeerCatalog(peer))
    const elapsed = Date.now() - start

    expect(entries).toEqual([])
    // Within ~1.5x the timeout — generous to avoid CI flake but tight
    // enough to catch missing timeouts.
    expect(elapsed).toBeLessThan(200)
  })

  it("passes a peer's controlUrl to the client factory", async () => {
    const seen: string[] = []
    const peer: PeerRecord = {
      hostId: "aka",
      controlUrl: "http://192.168.1.117:3001",
      displayName: "aka",
      caps: ["source"],
    }

    const fetcher = makePeerSourceFetcherLive({
      createClient: controlUrl => {
        seen.push(controlUrl)
        return { listSourceGames: async () => [] }
      },
      timeoutMs: 100,
    })

    await Effect.runPromise(fetcher.fetchPeerCatalog(peer))
    expect(seen).toEqual(["http://192.168.1.117:3001"])
  })
})
