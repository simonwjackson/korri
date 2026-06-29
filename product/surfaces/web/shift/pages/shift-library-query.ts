/**
 * Shift library — query core (pure).
 *
 * The functional core both depth-control shells (lens + filter-bar) drive: one
 * filter + sort pass over the flat library, plus genre-facet derivation for the
 * controls. Kept pure and out of the pages so the variants differ only in their
 * control surface, not in what filtering/sorting means — and so the behavior is
 * directly testable. Sorting is total and stable: a missing sortable value sinks
 * to the bottom, ties break on title, so order never depends on input order.
 */
import type { ShiftLibraryGame } from "./shift-library-game"

export type ShiftLibrarySort = "recent" | "title" | "playtime"

export interface ShiftLibraryQuery {
  readonly sort: ShiftLibrarySort
  readonly favoriteOnly: boolean
  /** Selected genres; empty means every genre. */
  readonly genres: readonly string[]
}

export const SHIFT_LIBRARY_DEFAULT_QUERY: ShiftLibraryQuery = {
  sort: "recent",
  favoriteOnly: false,
  genres: [],
}

export interface ShiftLibraryGenreFacet {
  readonly value: string
  readonly count: number
}

export function applyShiftLibraryQuery(
  games: readonly ShiftLibraryGame[],
  query: ShiftLibraryQuery,
): readonly ShiftLibraryGame[] {
  const filtered = games.filter(
    game =>
      (!query.favoriteOnly || game.favorite === true) &&
      (query.genres.length === 0 ||
        (game.genre !== undefined && query.genres.includes(game.genre))),
  )
  return [...filtered].sort(comparatorFor(query.sort))
}

export function deriveShiftLibraryGenres(
  games: readonly ShiftLibraryGame[],
): readonly ShiftLibraryGenreFacet[] {
  const counts = new Map<string, number>()
  for (const game of games) {
    if (game.genre === undefined) continue
    counts.set(game.genre, (counts.get(game.genre) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export function toggleGenre(
  genres: readonly string[],
  genre: string,
): readonly string[] {
  return genres.includes(genre)
    ? genres.filter(value => value !== genre)
    : [...genres, genre]
}

const SORT_CYCLE: readonly ShiftLibrarySort[] = ["recent", "title", "playtime"]

export function nextShiftLibrarySort(sort: ShiftLibrarySort): ShiftLibrarySort {
  const index = SORT_CYCLE.indexOf(sort)
  return SORT_CYCLE[(index + 1) % SORT_CYCLE.length]
}

export function shiftLibrarySortLabel(sort: ShiftLibrarySort): string {
  switch (sort) {
    case "recent":
      return "Recent"
    case "title":
      return "A–Z"
    case "playtime":
      return "Playtime"
  }
}

function comparatorFor(
  sort: ShiftLibrarySort,
): (a: ShiftLibraryGame, b: ShiftLibraryGame) => number {
  switch (sort) {
    case "title":
      return byTitle
    case "playtime":
      return (a, b) =>
        descendingNumber(a.playtimeMinutes, b.playtimeMinutes) || byTitle(a, b)
    case "recent":
      return (a, b) =>
        descendingNumber(a.lastPlayedAt, b.lastPlayedAt) || byTitle(a, b)
  }
}

function byTitle(a: ShiftLibraryGame, b: ShiftLibraryGame): number {
  return a.title.localeCompare(b.title)
}

/** Higher first; `undefined` always sinks below any real value. */
function descendingNumber(
  a: number | undefined,
  b: number | undefined,
): number {
  if (a === b) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return b - a
}
