/**
 * Shift library — Queue lanes (pure).
 *
 * The Queue reframes the library as a pipeline, not a pile: a game's place is
 * your relationship to it, not its alphabet. We derive an initial lane per game
 * from data we already have — the most-recently played sits in "Now", starred
 * games queue "Up Next", everything else rests in "Backlog" — then the page
 * lets you triage by promoting games forward. Derivation, grouping, and the
 * promote transition are pure here so the page only owns the live assignment.
 */
import type { ShiftLibraryGame } from "./shift-library-game"

export type ShiftLibraryLane = "now" | "next" | "backlog"

export interface ShiftLibraryLaneGroup {
  readonly id: ShiftLibraryLane
  readonly title: string
  readonly games: readonly ShiftLibraryGame[]
}

const LANE_TITLE: Record<ShiftLibraryLane, string> = {
  now: "Now Playing",
  next: "Up Next",
  backlog: "Backlog",
}

const LANE_ORDER: readonly ShiftLibraryLane[] = ["now", "next", "backlog"]

export function deriveShiftLibraryQueue(
  games: readonly ShiftLibraryGame[],
): ReadonlyMap<string, ShiftLibraryLane> {
  const mostRecentId = [...games]
    .filter(game => game.lastPlayedAt !== undefined)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0]?.id

  const assignment = new Map<string, ShiftLibraryLane>()
  for (const game of games) {
    if (game.id === mostRecentId) assignment.set(game.id, "now")
    else if (game.favorite === true) assignment.set(game.id, "next")
    else assignment.set(game.id, "backlog")
  }
  return assignment
}

export function shiftLibraryLanes(
  games: readonly ShiftLibraryGame[],
  assignment: ReadonlyMap<string, ShiftLibraryLane>,
): readonly ShiftLibraryLaneGroup[] {
  const buckets = new Map<ShiftLibraryLane, ShiftLibraryGame[]>(
    LANE_ORDER.map(lane => [lane, []]),
  )
  for (const game of games) {
    const lane = assignment.get(game.id) ?? "backlog"
    buckets.get(lane)?.push(game)
  }

  return LANE_ORDER.map(lane => ({
    id: lane,
    title: LANE_TITLE[lane],
    games: orderLane(buckets.get(lane) ?? [], lane),
  })).filter(group => group.games.length > 0)
}

/** Triage forward: Backlog → Up Next → Now. Now is the front of the line. */
export function promoteShiftLibraryLane(
  lane: ShiftLibraryLane,
): ShiftLibraryLane {
  return lane === "backlog" ? "next" : "now"
}

function orderLane(
  games: ShiftLibraryGame[],
  lane: ShiftLibraryLane,
): readonly ShiftLibraryGame[] {
  if (lane === "backlog") {
    return games.sort((a, b) => a.title.localeCompare(b.title))
  }
  // Now / Up Next read as a recency queue: most-recent first, then by title.
  return games.sort(
    (a, b) =>
      (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
      a.title.localeCompare(b.title),
  )
}
