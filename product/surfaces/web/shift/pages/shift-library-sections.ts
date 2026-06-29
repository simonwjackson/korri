/**
 * Shift library — shelf grouping (pure).
 *
 * Turns a flat library list into the sectioned shelves the shelves variant
 * renders: Continue Playing (anything played, most-recent first), Favorites,
 * and All Games. Grouping is presentation shaping, kept pure and out of the
 * page so it is directly testable and the page stays a dumb composer. Empty
 * sections are omitted so a shelf never renders with no tiles.
 */
import type { ShiftLibraryGame } from "./shift-library-game"

export interface ShiftLibrarySection {
  readonly id: string
  readonly title: string
  readonly games: readonly ShiftLibraryGame[]
}

export function buildShiftLibrarySections(
  games: readonly ShiftLibraryGame[],
): readonly ShiftLibrarySection[] {
  const candidates: readonly ShiftLibrarySection[] = [
    {
      id: "continue",
      title: "Continue Playing",
      games: [...games]
        .filter(game => game.lastPlayedAt !== undefined)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)),
    },
    {
      id: "favorites",
      title: "Favorites",
      games: games.filter(game => game.favorite === true),
    },
    {
      id: "all",
      title: "All Games",
      games,
    },
  ]

  return candidates.filter(section => section.games.length > 0)
}

/**
 * Group the library into one shelf per genre, alphabetical by genre, titles
 * alphabetical within. Games without a genre fall into a trailing "Other"
 * shelf so nothing is dropped. Used by the lens variant's "By Genre" mode.
 */
export function buildShiftLibraryGenreSections(
  games: readonly ShiftLibraryGame[],
): readonly ShiftLibrarySection[] {
  const byGenre = new Map<string, ShiftLibraryGame[]>()
  for (const game of games) {
    const key = game.genre ?? "Other"
    const bucket = byGenre.get(key)
    if (bucket) bucket.push(game)
    else byGenre.set(key, [game])
  }

  return [...byGenre.entries()]
    .sort(
      ([a], [b]) => orderGenreKey(a) - orderGenreKey(b) || a.localeCompare(b),
    )
    .map(([genre, bucket]) => ({
      id: `genre:${genre}`,
      title: genre,
      games: bucket.sort((a, b) => a.title.localeCompare(b.title)),
    }))
}

function orderGenreKey(genre: string): number {
  // Keep the catch-all "Other" shelf last regardless of alphabetisation.
  return genre === "Other" ? 1 : 0
}
