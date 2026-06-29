/**
 * Shift library — Variant D: persistent filter bar.
 *
 * The maximal-discoverability counterpoint to the lens variant: every control
 * stands in a bar above the grid — a favorites toggle, a genre chip per genre,
 * and a sort cycle — so the depth is always in sight and one move away. It
 * drives the SAME pure query core as the lens variant, so this screen exists to
 * judge the trade-off (standing chrome vs. games-as-hero), not a different
 * behavior. Built to compare against ShiftLibraryLens before one control model
 * is committed as Shift's library route.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftLibraryTile } from "./ShiftLibraryTile"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  applyShiftLibraryQuery,
  deriveShiftLibraryGenres,
  nextShiftLibrarySort,
  type ShiftLibrarySort,
  shiftLibrarySortLabel,
  toggleGenre,
} from "./shift-library-query"

export interface ShiftLibraryFilterBarProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly title?: string
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryFilterBar({
  games,
  title = "Library",
  onSelect,
  onBack,
}: ShiftLibraryFilterBarProps) {
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [genres, setGenres] = useState<readonly string[]>([])
  const [sort, setSort] = useState<ShiftLibrarySort>("recent")

  const facets = useMemo(() => deriveShiftLibraryGenres(games), [games])
  const visible = useMemo(
    () => applyShiftLibraryQuery(games, { sort, favoriteOnly, genres }),
    [games, sort, favoriteOnly, genres],
  )

  useInputAction("back", () => onBack?.())

  return (
    <div data-shift-library className="shift-lib shift-lib-filterbar intrinsic">
      <header className="shift-lib-top">
        <h1 className="shift-lib-heading">{title}</h1>
        <span className="shift-lib-count">{countLabel(visible.length)}</span>
      </header>

      <div
        className="shift-lib-bar"
        role="toolbar"
        aria-label="Filter and sort"
      >
        <button
          type="button"
          className="shift-lib-chip"
          data-active={favoriteOnly || undefined}
          aria-pressed={favoriteOnly}
          onClick={() => setFavoriteOnly(value => !value)}
        >
          ★ Favorites
        </button>

        {facets.map(facet => (
          <button
            type="button"
            key={facet.value}
            className="shift-lib-chip"
            data-active={genres.includes(facet.value) || undefined}
            aria-pressed={genres.includes(facet.value)}
            onClick={() =>
              setGenres(current => toggleGenre(current, facet.value))
            }
          >
            {facet.value}
            <span className="shift-lib-chip-count">{facet.count}</span>
          </button>
        ))}

        <button
          type="button"
          className="shift-lib-chip shift-lib-chip-sort"
          onClick={() => setSort(nextShiftLibrarySort)}
        >
          Sort: {shiftLibrarySortLabel(sort)}
        </button>
      </div>

      {visible.length > 0 ? (
        <div className="shift-lib-grid">
          {visible.map(game => (
            <ShiftLibraryTile key={game.id} game={game} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <p className="shift-lib-empty">Nothing matches these filters.</p>
      )}
    </div>
  )
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "game" : "games"}`
}
