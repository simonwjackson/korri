import { describe, expect, it } from "bun:test"
import { foldCatalogEntries } from "./fold-catalog-entries"
import type { CatalogEntry } from "./snapshot.rpc"

describe("foldCatalogEntries", () => {
  it("folds local and remote entries that share a hash identity", () => {
    const folded = foldCatalogEntries({
      entries: [
        entry({
          id: "local/f-zero",
          source: localSource(),
          identity: hash("a"),
        }),
        entry({
          id: "aka/f-zero",
          source: remoteSource("aka"),
          identity: hash("a"),
        }),
      ],
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
        entry({
          id: "local/steam",
          source: localSource(),
          identity: provider("@korri:steam", "1029210"),
        }),
        entry({
          id: "aka/steam",
          source: remoteSource("aka"),
          identity: provider("@korri:steam", "1029210"),
        }),
        entry({
          id: "itch/same-ref",
          source: remoteSource("itch"),
          identity: provider("@korri:itch", "1029210"),
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001", "http://itch:3001"]),
    })

    expect(folded.map(item => item.id).sort()).toEqual([
      "itch/same-ref",
      "local/steam",
    ])
  })

  it("keeps local display fields when launching through a remote representative", () => {
    const folded = foldCatalogEntries({
      entries: [
        entry({
          id: "local/store",
          title: "Local Store Name",
          source: localSource(),
          identity: provider("@korri:steam", "123"),
          launchable: false,
        }),
        entry({
          id: "aka/store",
          title: "Remote Store Name",
          source: remoteSource("aka"),
          identity: provider("@korri:steam", "123"),
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
        entry({
          id: "aka/game",
          source: remoteSource("aka"),
          identity: hash("b"),
        }),
      ],
      presentPeerControlUrls: new Set(),
    })

    expect(folded[0]?.availability).toBe("remote-unreachable")
  })

  it("never folds tagless entries or different identity kinds", () => {
    const folded = foldCatalogEntries({
      entries: [
        entry({ id: "one", source: localSource() }),
        entry({ id: "two", source: remoteSource("aka") }),
        entry({ id: "hash", source: localSource(), identity: hash("same") }),
        entry({
          id: "provider",
          source: remoteSource("aka"),
          identity: provider("same", "same"),
        }),
      ],
      presentPeerControlUrls: new Set(["http://aka:3001"]),
    })

    expect(folded.map(item => item.id).sort()).toEqual([
      "hash",
      "one",
      "provider",
      "two",
    ])
  })

  it("returns empty output for empty input", () => {
    expect(foldCatalogEntries({ entries: [] })).toEqual([])
  })
})

function entry(options: {
  readonly id: string
  readonly title?: string
  readonly source: CatalogEntry["source"]
  readonly identity?: CatalogEntry["releases"][number]["identity"]
  readonly launchable?: boolean
}): CatalogEntry {
  const launchable = options.launchable ?? true
  return {
    id: options.id,
    itemId: options.id,
    title: options.title ?? `${options.id} title`,
    releases: [
      {
        id: "default",
        system: "snes",
        launchable,
        ...(launchable ? { launch: { use: "default" } } : {}),
        ...(options.identity ? { identity: options.identity } : {}),
      },
    ],
    launchable,
    system: "snes",
    metadata: { name: options.title ?? `${options.id} title` },
    source: options.source,
  }
}

function hash(
  seed: string,
): NonNullable<CatalogEntry["releases"][number]["identity"]> {
  return {
    kind: "hash",
    value: `sha256:${seed.repeat(64).slice(0, 64)}`,
  }
}

function provider(
  provider: string,
  ref: string,
): NonNullable<CatalogEntry["releases"][number]["identity"]> {
  return { kind: "provider", value: { provider, ref } }
}

function localSource(): CatalogEntry["source"] {
  return { hostId: "self", controlUrl: "http://self:3001", isLocal: true }
}

function remoteSource(hostId: string): CatalogEntry["source"] {
  return {
    hostId,
    controlUrl: `http://${hostId}:3001`,
    isLocal: false,
  }
}
