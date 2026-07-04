/**
 * Shift store — query core (pure).
 *
 * The one filter + sort pass every store variant drives: a free-text match
 * over title/developer/genre, a source-facet filter, and a total, stable sort.
 * Kept pure and out of the variants so they differ only in their control
 * surface, not in what "search" means — and so the behaviour is directly
 * testable. A missing sortable value sinks to the bottom and ties break on
 * title, so order never depends on input order.
 */
import type { ShiftStoreEntry } from "./shift-store-entry"

export type ShiftStoreSort = "relevance" | "title" | "source"

export interface ShiftStoreQuery {
  /** Free-text search; empty matches everything. */
  readonly text: string
  /** Selected source facets; empty means every source. */
  readonly sources: readonly string[]
  readonly sort: ShiftStoreSort
}

export const SHIFT_STORE_DEFAULT_QUERY: ShiftStoreQuery = {
  text: "",
  sources: [],
  sort: "relevance",
}

export interface ShiftStoreSourceFacet {
  readonly value: string
  readonly count: number
}

export function applyShiftStoreQuery(
  entries: readonly ShiftStoreEntry[],
  query: ShiftStoreQuery,
): readonly ShiftStoreEntry[] {
  const text = query.text.trim().toLowerCase()
  const filtered = entries.filter(
    entry =>
      (query.sources.length === 0 ||
        entry.sources.some(source => query.sources.includes(source))) &&
      (text.length === 0 || matchesText(entry, text)),
  )
  return [...filtered].sort(comparatorFor(query.sort, text))
}

export function deriveShiftStoreSources(
  entries: readonly ShiftStoreEntry[],
): readonly ShiftStoreSourceFacet[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const source of entry.sources) {
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export interface ShiftStoreSourceShelf {
  readonly source: string
  readonly entries: readonly ShiftStoreEntry[]
}

/**
 * Group entries into per-source shelves for the storefront browse view. Shelf
 * order follows facet weight (busiest source first, then name); entries within
 * a shelf are alphabetical, so a curated front page is stable and never depends
 * on input order.
 */
export function groupShiftStoreBySource(
  entries: readonly ShiftStoreEntry[],
): readonly ShiftStoreSourceShelf[] {
  return deriveShiftStoreSources(entries).map(facet => ({
    source: facet.value,
    entries: entries
      .filter(entry => entry.sources.includes(facet.value))
      .sort(byTitle),
  }))
}

export function toggleSource(
  sources: readonly string[],
  source: string,
): readonly string[] {
  return sources.includes(source)
    ? sources.filter(value => value !== source)
    : [...sources, source]
}

const SORT_CYCLE: readonly ShiftStoreSort[] = ["relevance", "title", "source"]

export function nextShiftStoreSort(sort: ShiftStoreSort): ShiftStoreSort {
  const index = SORT_CYCLE.indexOf(sort)
  return SORT_CYCLE[(index + 1) % SORT_CYCLE.length]
}

export function shiftStoreSortLabel(sort: ShiftStoreSort): string {
  switch (sort) {
    case "relevance":
      return "Relevance"
    case "title":
      return "A–Z"
    case "source":
      return "Source"
  }
}

function matchesText(entry: ShiftStoreEntry, text: string): boolean {
  return (
    entry.title.toLowerCase().includes(text) ||
    (entry.developer?.toLowerCase().includes(text) ?? false) ||
    (entry.genre?.toLowerCase().includes(text) ?? false)
  )
}

function comparatorFor(
  sort: ShiftStoreSort,
  text: string,
): (a: ShiftStoreEntry, b: ShiftStoreEntry) => number {
  switch (sort) {
    case "title":
      return byTitle
    case "source":
      return (a, b) =>
        primarySource(a).localeCompare(primarySource(b)) || byTitle(a, b)
    case "relevance":
      // With a query, a title that STARTS with the text ranks above a mere
      // substring match; without one, relevance is just alphabetical.
      return (a, b) =>
        text.length === 0
          ? byTitle(a, b)
          : rank(b, text) - rank(a, text) || byTitle(a, b)
  }
}

/** The alphabetically-first source, used only to give the source sort a total,
 * stable order for grouped releases. */
function primarySource(entry: ShiftStoreEntry): string {
  return [...entry.sources].sort()[0] ?? ""
}

function rank(entry: ShiftStoreEntry, text: string): number {
  return entry.title.toLowerCase().startsWith(text) ? 1 : 0
}

function byTitle(a: ShiftStoreEntry, b: ShiftStoreEntry): number {
  return a.title.localeCompare(b.title)
}
