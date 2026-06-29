/**
 * Shift library — Atlas layout (pure).
 *
 * The Atlas is a zoomable map: games live at fixed positions clustered into
 * genre "territories", so you navigate by place. This computes that map
 * deterministically from the library — one cluster per genre laid out on a grid,
 * covers tiled within each cluster — so the page only pans/zooms and renders. A
 * genre-less game falls into a trailing "Other" territory so nothing is lost.
 *
 * Coordinates are normalised cluster-grid cells (col/row); the page maps them to
 * CSS space. Heavier 3D spatial libraries (see the boxbuster surface) realise
 * the same "library as territory" idea with a walkable store.
 */
import type { ShiftLibraryGame } from "./shift-library-game"

export interface ShiftAtlasCluster {
  readonly id: string
  readonly label: string
  /** Cluster cell on the territory grid. */
  readonly col: number
  readonly row: number
  readonly games: readonly ShiftLibraryGame[]
}

export interface ShiftAtlas {
  readonly clusters: readonly ShiftAtlasCluster[]
  readonly columns: number
}

export function buildShiftLibraryAtlas(
  games: readonly ShiftLibraryGame[],
): ShiftAtlas {
  const byGenre = new Map<string, ShiftLibraryGame[]>()
  for (const game of games) {
    const key = game.genre ?? "Other"
    const bucket = byGenre.get(key)
    if (bucket) bucket.push(game)
    else byGenre.set(key, [game])
  }

  const ordered = [...byGenre.entries()].sort(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
  )
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)))

  const clusters = ordered.map(([label, bucket], index) => ({
    id: `territory:${label}`,
    label,
    col: index % columns,
    row: Math.floor(index / columns),
    games: bucket.sort((a, b) => a.title.localeCompare(b.title)),
  }))

  return { clusters, columns }
}

function rank(genre: string): number {
  // Keep the catch-all territory last regardless of alphabetisation.
  return genre === "Other" ? 1 : 0
}
