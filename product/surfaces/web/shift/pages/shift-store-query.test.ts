import { describe, expect, it } from "bun:test"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  groupShiftStoreBySource,
  nextShiftStoreSort,
  SHIFT_STORE_DEFAULT_QUERY,
  type ShiftStoreQuery,
  shiftStoreSortLabel,
  toggleSource,
} from "./shift-store-query"

const entry = (
  id: string,
  extra: Partial<ShiftStoreEntry> = {},
): ShiftStoreEntry => ({
  id,
  title: id.toUpperCase(),
  artUrl: `${id}.png`,
  sources: ["Community"],
  status: "available",
  ...extra,
})

const query = (over: Partial<ShiftStoreQuery> = {}): ShiftStoreQuery => ({
  ...SHIFT_STORE_DEFAULT_QUERY,
  ...over,
})

const ids = (entries: readonly ShiftStoreEntry[]) => entries.map(e => e.id)

describe("applyShiftStoreQuery — text search", () => {
  const entries = [
    entry("a", { title: "Celeste", developer: "Maddy Makes Games" }),
    entry("b", { title: "Hollow Knight", genre: "Metroidvania" }),
    entry("c", { title: "Hades", developer: "Supergiant" }),
  ]

  it("matches on title, case-insensitive", () => {
    expect(ids(applyShiftStoreQuery(entries, query({ text: "hol" })))).toEqual([
      "b",
    ])
  })

  it("matches on developer and genre too", () => {
    expect(
      ids(applyShiftStoreQuery(entries, query({ text: "maddy" }))),
    ).toEqual(["a"])
    expect(
      ids(applyShiftStoreQuery(entries, query({ text: "metroid" }))),
    ).toEqual(["b"])
  })

  it("ignores surrounding whitespace and empty query matches all", () => {
    expect(ids(applyShiftStoreQuery(entries, query({ text: "   " })))).toEqual([
      "a",
      "c",
      "b",
    ])
  })
})

describe("applyShiftStoreQuery — sort", () => {
  const entries = [
    entry("a", { title: "Hades", sources: ["itch.io"] }),
    entry("b", { title: "Hollow Knight", sources: ["Community"] }),
    entry("c", { title: "Halo", sources: ["Community"] }),
  ]

  it("relevance ranks a title prefix-match above a substring match", () => {
    const ranked = [
      entry("x", { title: "Super Hadal Diver" }), // substring of title
      entry("y", { title: "Hades" }), // prefix of title
    ]
    // Both contain "had"; only "Hades" starts with it, so it floats up.
    expect(ids(applyShiftStoreQuery(ranked, query({ text: "had" })))).toEqual([
      "y",
      "x",
    ])
  })

  it("title sorts alphabetically", () => {
    expect(
      ids(applyShiftStoreQuery(entries, query({ sort: "title" }))),
    ).toEqual(["a", "c", "b"])
  })

  it("source sorts by source then title", () => {
    expect(
      ids(applyShiftStoreQuery(entries, query({ sort: "source" }))),
    ).toEqual(["c", "b", "a"])
  })
})

describe("applyShiftStoreQuery — source facet", () => {
  const entries = [
    entry("a", { title: "Alpha", sources: ["itch.io"] }),
    entry("b", { title: "Bravo", sources: ["Community"] }),
    entry("c", { title: "Charlie", sources: ["Community"] }),
  ]

  it("filters to the selected sources", () => {
    expect(
      ids(applyShiftStoreQuery(entries, query({ sources: ["Community"] }))),
    ).toEqual(["b", "c"])
  })

  it("matches a grouped release when any of its sources is selected", () => {
    const grouped = [
      entry("a", { title: "Alpha", sources: ["itch.io", "Community"] }),
      entry("b", { title: "Bravo", sources: ["SMW Central"] }),
    ]
    expect(
      ids(applyShiftStoreQuery(grouped, query({ sources: ["Community"] }))),
    ).toEqual(["a"])
  })

  it("derives source facets counting every source of a grouped release", () => {
    const grouped = [
      entry("a", { sources: ["Community", "itch.io"] }),
      entry("b", { sources: ["Community"] }),
    ]
    expect(deriveShiftStoreSources(grouped)).toEqual([
      { value: "Community", count: 2 },
      { value: "itch.io", count: 1 },
    ])
  })
})

describe("groupShiftStoreBySource", () => {
  it("groups into shelves by facet weight, entries alphabetical", () => {
    const entries = [
      entry("a", { title: "Bravo", sources: ["Community"] }),
      entry("b", { title: "Alpha", sources: ["Community"] }),
      entry("c", { title: "Zulu", sources: ["itch.io"] }),
    ]
    const shelves = groupShiftStoreBySource(entries)
    expect(shelves.map(shelf => shelf.source)).toEqual(["Community", "itch.io"])
    expect(shelves[0].entries.map(e => e.id)).toEqual(["b", "a"])
    expect(shelves[1].entries.map(e => e.id)).toEqual(["c"])
  })

  it("places a grouped release on every one of its source shelves", () => {
    const entries = [
      entry("a", { title: "Alpha", sources: ["Community", "itch.io"] }),
    ]
    const shelves = groupShiftStoreBySource(entries)
    expect(shelves.map(shelf => shelf.source).sort()).toEqual([
      "Community",
      "itch.io",
    ])
    expect(shelves.every(shelf => shelf.entries[0]?.id === "a")).toBe(true)
  })
})

describe("store query helpers", () => {
  it("toggleSource adds then removes", () => {
    expect(toggleSource([], "itch.io")).toEqual(["itch.io"])
    expect(toggleSource(["itch.io"], "itch.io")).toEqual([])
  })

  it("nextShiftStoreSort cycles relevance → title → source → relevance", () => {
    expect(nextShiftStoreSort("relevance")).toBe("title")
    expect(nextShiftStoreSort("title")).toBe("source")
    expect(nextShiftStoreSort("source")).toBe("relevance")
  })

  it("labels every sort", () => {
    expect(shiftStoreSortLabel("relevance")).toBe("Relevance")
    expect(shiftStoreSortLabel("title")).toBe("A–Z")
    expect(shiftStoreSortLabel("source")).toBe("Source")
  })
})
