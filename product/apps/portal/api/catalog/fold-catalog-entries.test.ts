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

  it("returns empty output for empty input", () => {
    expect(foldCatalogEntries({ entries: [] })).toEqual([])
  })
})
