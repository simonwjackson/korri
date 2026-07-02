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
import { ShiftLibraryEmpty } from "./ShiftLibraryEmpty"
import { ShiftLibraryFilterToolbar } from "./ShiftLibraryFilterToolbar"
import { ShiftLibraryGridView } from "./ShiftLibraryGridView"
import { ShiftLibraryHeader } from "./ShiftLibraryHeader"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  applyShiftLibraryQuery,
  deriveShiftLibraryGenres,
  nextShiftLibrarySort,
  type ShiftLibrarySort,
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
      <ShiftLibraryHeader title={title} count={visible.length} />
      <ShiftLibraryFilterToolbar
        favoriteOnly={favoriteOnly}
        onToggleFavorite={() => setFavoriteOnly(value => !value)}
        facets={facets}
        selectedGenres={genres}
        onToggleGenre={genre =>
          setGenres(current => toggleGenre(current, genre))
        }
        sort={sort}
        onCycleSort={() => setSort(nextShiftLibrarySort)}
      />
      {visible.length > 0 ? (
        <ShiftLibraryGridView games={visible} onSelect={onSelect} />
      ) : (
        <ShiftLibraryEmpty message="Nothing matches these filters." />
      )}
    </div>
  )
}
