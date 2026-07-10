import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  CatalogFactsSource,
  decodeCatalogSnapshotFacts,
  makeInMemoryCatalogFactsSourceLayer,
} from "./catalog-facts-source"

describe("decodeCatalogSnapshotFacts", () => {
  it("normalizes playStats timestamps from raw bridge JSON", () => {
    const decoded = decodeCatalogSnapshotFacts(
      catalogSnapshotJson({ lastPlayed: "2026-07-07T04:42:08.376Z" }),
    )

    expect(decoded.entries[0]?.playStats?.lastPlayed).toBeInstanceOf(Date)
    expect(decoded.entries[0]?.playStats?.lastPlayed?.getTime()).toBe(
      new Date("2026-07-07T04:42:08.376Z").getTime(),
    )
  })

  it("rejects invalid playStats timestamps from raw bridge JSON", () => {
    expect(() =>
      decodeCatalogSnapshotFacts(catalogSnapshotJson({ lastPlayed: "nope" })),
    ).toThrow(/invalid playStats\.lastPlayed/)
  })
})

function catalogSnapshotJson(options: { readonly lastPlayed: string }) {
  return {
    entries: [
      {
        id: "local/recent",
        itemId: "local/recent",
        title: "Recent Game",
        releases: [
          {
            id: "default",
            system: "steam",
            launchable: true,
          },
        ],
        launchable: true,
        metadata: { name: "Recent Game" },
        source: {
          hostId: "self",
          controlUrl: "http://self:3001",
          isLocal: true,
        },
        playStats: {
          lastPlayed: options.lastPlayed,
          playCount: 2,
          totalPlaytimeSeconds: 258,
        },
      },
    ],
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://self:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready",
        entryCount: 1,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready",
      loadingPeers: 0,
      readyPeers: 0,
      failedPeers: 0,
      generation: 1,
    },
  }
}

describe("CatalogFactsSource", () => {
  it("returns facts without interpreting presentation state", async () => {
    const facts = {
      entries: [],
      peers: [],
      generation: 1,
      updatedAt: "2026-06-13T00:00:00.000Z",
      health: {
        coordinatorReachable: true,
        self: "ready" as const,
        loadingPeers: 0,
        readyPeers: 0,
        failedPeers: 0,
        generation: 1,
      },
    }

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* CatalogFactsSource
        return yield* source.snapshot("fabric")
      }).pipe(Effect.provide(makeInMemoryCatalogFactsSourceLayer(facts))),
    )

    expect(result).toEqual(facts)
  })
})
