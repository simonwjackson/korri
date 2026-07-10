import { describe, expect, it } from "bun:test"
import {
  catalogEntryFixture,
  hashIdentityFixture,
  localSourceFixture,
  providerIdentityFixture,
  remoteSourceFixture,
  sameHashAcrossStoragesFixture,
  sameProviderAcrossStoragesFixture,
  taglessAcrossStoragesFixture,
} from "./catalog-folding-fixtures"
import { foldCatalogEntries } from "./fold-catalog-entries"

describe("foldCatalogEntries", () => {
  it("folds local and remote entries that share a hash identity", () => {
    const folded = foldCatalogEntries({
      entries: sameHashAcrossStoragesFixture(),
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({
      id: "local/f-zero",
      title: "local/f-zero title",
      source: { isLocal: true },
      availability: "local-launchable",
    })
  })

  it("folds provider identities only with the same provider and ref", () => {
    const folded = foldCatalogEntries({
      entries: [
        ...sameProviderAcrossStoragesFixture(),
        catalogEntryFixture({
          id: "itch/same-ref",
          source: remoteSourceFixture("itch"),
          identity: providerIdentityFixture("@korri:itch", "1029210"),
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001", "http://itch:3001"]),
    })

    expect(folded.map(item => item.id).sort()).toEqual([
      "itch/same-ref",
      "local/store-game",
    ])
  })

  it("keeps local display fields when launching through a remote representative", () => {
    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "local/store",
          title: "Local Store Name",
          source: localSourceFixture(),
          identity: providerIdentityFixture("@korri:store", "123"),
          launchable: false,
        }),
        catalogEntryFixture({
          id: "aka/store",
          title: "Remote Store Name",
          source: remoteSourceFixture("aka"),
          identity: providerIdentityFixture("@korri:store", "123"),
          launchable: true,
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({
      id: "aka/store",
      itemId: "aka/store",
      title: "Local Store Name",
      source: { hostId: "aka", isLocal: false },
      availability: "remote-available",
    })
  })

  it("emits folded launch alternatives in retry order", () => {
    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "aka/game",
          source: remoteSourceFixture("aka"),
          identity: hashIdentityFixture("retry"),
        }),
        catalogEntryFixture({
          id: "zu/game",
          source: remoteSourceFixture("zu"),
          identity: hashIdentityFixture("retry"),
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001", "http://zu:3001"]),
    })

    expect(folded[0]?.id).toBe("aka/game")
    expect(folded[0]?.launchAlternatives).toEqual([
      {
        id: "aka/game",
        releaseId: "default",
        source: remoteSourceFixture("aka"),
      },
      {
        id: "zu/game",
        releaseId: "default",
        source: remoteSourceFixture("zu"),
      },
    ])
  })

  it("merges remote play history onto a local folded representative", () => {
    const identity = providerIdentityFixture("@korri:steam", "1029210")
    const remoteLastPlayed = new Date("2026-07-07T04:42:08.376Z")

    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "local/30xx",
          title: "30XX",
          source: localSourceFixture(),
          identity,
        }),
        catalogEntryFixture({
          id: "aka/thirty-xx",
          title: "30XX on AKA",
          source: remoteSourceFixture("aka"),
          identity,
          playStats: {
            lastPlayed: remoteLastPlayed,
            playCount: 2,
            totalPlaytimeSeconds: 258,
          },
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({
      id: "local/30xx",
      title: "30XX",
      source: { hostId: "self", isLocal: true },
      availability: "local-launchable",
    })
    expect(folded[0]?.playStats).toEqual({
      lastPlayed: remoteLastPlayed,
      playCount: 2,
      totalPlaytimeSeconds: 258,
    })
  })

  it("sums visible play history across folded peers and keeps newest recency", () => {
    const identity = providerIdentityFixture("@korri:steam", "1029210")
    const older = new Date("2026-07-01T00:00:00.000Z")
    const newest = new Date("2026-07-09T00:00:00.000Z")

    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "local/30xx",
          source: localSourceFixture(),
          identity,
          playStats: {
            lastPlayed: older,
            playCount: 1,
            totalPlaytimeSeconds: 60,
          },
        }),
        catalogEntryFixture({
          id: "aka/thirty-xx",
          source: remoteSourceFixture("aka"),
          identity,
          playStats: {
            lastPlayed: newest,
            playCount: 2,
            totalPlaytimeSeconds: 258,
          },
        }),
        catalogEntryFixture({
          id: "sobo/30xx",
          source: remoteSourceFixture("sobo"),
          identity,
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001", "http://sobo:3001"]),
    })

    expect(folded[0]?.playStats).toEqual({
      lastPlayed: newest,
      playCount: 3,
      totalPlaytimeSeconds: 318,
    })
  })

  it("sums defined never-played stats without inventing recency", () => {
    const identity = providerIdentityFixture("@korri:steam", "1029210")

    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "local/30xx",
          source: localSourceFixture(),
          identity,
          playStats: { playCount: 0, totalPlaytimeSeconds: 0 },
        }),
        catalogEntryFixture({
          id: "aka/thirty-xx",
          source: remoteSourceFixture("aka"),
          identity,
          playStats: { playCount: 1, totalPlaytimeSeconds: 45 },
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded[0]?.playStats).toEqual({
      playCount: 1,
      totalPlaytimeSeconds: 45,
    })
  })

  it("retains folded zero-valued play stats without recency", () => {
    const identity = providerIdentityFixture("@korri:steam", "1029210")

    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "local/30xx",
          source: localSourceFixture(),
          identity,
          playStats: { playCount: 0, totalPlaytimeSeconds: 0 },
        }),
        catalogEntryFixture({
          id: "aka/thirty-xx",
          source: remoteSourceFixture("aka"),
          identity,
          playStats: { playCount: 0, totalPlaytimeSeconds: 0 },
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded[0]?.playStats).toEqual({
      playCount: 0,
      totalPlaytimeSeconds: 0,
    })
  })

  it("preserves singleton play history exactly", () => {
    const playStats = {
      lastPlayed: new Date("2026-07-08T00:00:00.000Z"),
      playCount: 5,
      totalPlaytimeSeconds: 900,
    }

    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "local/solo",
          source: localSourceFixture(),
          identity: hashIdentityFixture("solo"),
          playStats,
        }),
      ],
    })

    expect(folded[0]?.playStats).toBe(playStats)
  })

  it("keeps never-played folded entries without play history", () => {
    const folded = foldCatalogEntries({
      entries: sameHashAcrossStoragesFixture(),
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded[0]?.playStats).toBeUndefined()
  })

  it("marks remote-only folds unreachable when their peer is absent", () => {
    const folded = foldCatalogEntries({
      entries: [
        catalogEntryFixture({
          id: "aka/game",
          source: remoteSourceFixture("aka"),
          identity: hashIdentityFixture("b"),
        }),
      ],
      presentPeerControlUrls: new Set(),
    })

    expect(folded[0]?.availability).toBe("remote-unreachable")
  })

  it("never folds tagless entries or different identity kinds", () => {
    const folded = foldCatalogEntries({
      entries: [
        ...taglessAcrossStoragesFixture(),
        catalogEntryFixture({
          id: "hash",
          source: localSourceFixture(),
          identity: hashIdentityFixture("same"),
        }),
        catalogEntryFixture({
          id: "provider",
          source: remoteSourceFixture("aka"),
          identity: providerIdentityFixture("same", "same"),
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded.map(item => item.id).sort()).toEqual([
      "aka/tagless",
      "hash",
      "local/tagless",
      "provider",
    ])
  })

  it("does not let one entry with multiple identities bridge unrelated groups", () => {
    const multiIdentity = {
      ...catalogEntryFixture({
        id: "local/bundle",
        source: localSourceFixture(),
      }),
      releases: [
        {
          id: "a",
          system: "snes",
          launchable: true,
          identity: hashIdentityFixture("a"),
        },
        {
          id: "b",
          system: "snes",
          launchable: true,
          identity: hashIdentityFixture("b"),
        },
      ],
    }

    const folded = foldCatalogEntries({
      entries: [
        multiIdentity,
        catalogEntryFixture({
          id: "remote/a",
          source: remoteSourceFixture("aka"),
          identity: hashIdentityFixture("a"),
        }),
        catalogEntryFixture({
          id: "remote/b",
          source: remoteSourceFixture("sobo"),
          identity: hashIdentityFixture("b"),
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001", "http://sobo:3001"]),
    })

    expect(folded.map(item => item.id).sort()).toEqual([
      "local/bundle",
      "remote/a",
      "remote/b",
    ])
  })

  it("returns empty output for empty input", () => {
    expect(foldCatalogEntries({ entries: [] })).toEqual([])
  })
})
