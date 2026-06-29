/**
 * Shift library — Concierge intents (pure).
 *
 * The Concierge reframes the library as a question, not a collection: you never
 * face the wall, you express an intent and get a small handful back. Each intent
 * resolves — purely and deterministically — to a capped result set over the
 * library, mostly by reusing the shared query core. Kept out of the page so the
 * intent vocabulary is one testable place and the page only renders prompts and
 * results. Grounded in data the catalog actually carries today (recency,
 * playtime, favorites); richer intents ("never finished", "couch co-op") arrive
 * when that data does.
 */
import type { ShiftLibraryGame } from "./shift-library-game"
import { applyShiftLibraryQuery } from "./shift-library-query"

export interface ShiftLibraryIntent {
  readonly id: string
  readonly label: string
  readonly blurb: string
}

export const SHIFT_LIBRARY_INTENTS: readonly ShiftLibraryIntent[] = [
  { id: "resume", label: "Jump back in", blurb: "Pick up where you left off" },
  { id: "favorites", label: "My favorites", blurb: "The ones you starred" },
  { id: "most-played", label: "Most played", blurb: "Where the hours went" },
  { id: "fresh", label: "Never played", blurb: "Still in the wrapper" },
  { id: "surprise", label: "Surprise me", blurb: "A handful at random" },
]

const RESULT_CAP = 12

export function resolveShiftLibraryIntent(
  games: readonly ShiftLibraryGame[],
  intentId: string,
): readonly ShiftLibraryGame[] {
  switch (intentId) {
    case "resume":
      return capped(
        applyShiftLibraryQuery(played(games), {
          sort: "recent",
          favoriteOnly: false,
          genres: [],
        }),
      )
    case "favorites":
      return capped(
        applyShiftLibraryQuery(games, {
          sort: "recent",
          favoriteOnly: true,
          genres: [],
        }),
      )
    case "most-played":
      return capped(
        applyShiftLibraryQuery(
          games.filter(game => game.playtimeMinutes !== undefined),
          { sort: "playtime", favoriteOnly: false, genres: [] },
        ),
      )
    case "fresh":
      return capped(
        applyShiftLibraryQuery(
          games.filter(game => game.lastPlayedAt === undefined),
          { sort: "title", favoriteOnly: false, genres: [] },
        ),
      )
    case "surprise":
      return capped(surprise(games))
    default:
      return []
  }
}

function played(
  games: readonly ShiftLibraryGame[],
): readonly ShiftLibraryGame[] {
  return games.filter(game => game.lastPlayedAt !== undefined)
}

function capped(
  games: readonly ShiftLibraryGame[],
): readonly ShiftLibraryGame[] {
  return games.slice(0, RESULT_CAP)
}

/**
 * Deterministic "random": order by a stable hash of the id, so the set looks
 * shuffled (not alphabetical) yet is reproducible for tests and across renders.
 */
function surprise(
  games: readonly ShiftLibraryGame[],
): readonly ShiftLibraryGame[] {
  return [...games].sort((a, b) => hashId(a.id) - hashId(b.id))
}

function hashId(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }
  return hash
}
