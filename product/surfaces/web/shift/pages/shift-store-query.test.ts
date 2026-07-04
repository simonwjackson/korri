import { describe, expect, it } from "bun:test"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
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
  source: "Community",
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
    entry("a", { title: "Hades", source: "itch.io" }),
    entry("b", { title: "Hollow Knight", source: "Community" }),
    entry("c", { title: "Halo", source: "Community" }),
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
    entry("a", { title: "Alpha", source: "itch.io" }),
    entry("b", { title: "Bravo", source: "Community" }),
    entry("c", { title: "Charlie", source: "Community" }),
  ]

  it("filters to the selected sources", () => {
    expect(
      ids(applyShiftStoreQuery(entries, query({ sources: ["Community"] }))),
    ).toEqual(["b", "c"])
  })

  it("derives source facets by count desc then name", () => {
    expect(deriveShiftStoreSources(entries)).toEqual([
      { value: "Community", count: 2 },
      { value: "itch.io", count: 1 },
    ])
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
