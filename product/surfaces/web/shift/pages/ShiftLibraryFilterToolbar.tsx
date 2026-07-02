/**
 * Shift library — the Filter Bar variant's standing toolbar (molecule).
 *
 * The always-in-sight control bar: a Favorites toggle, one genre chip per
 * derived facet (with its count), and a sort cycle. It only reports intent;
 * the page owns the query state and the pure query core does the work.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftLibraryFilterChip } from "./ShiftLibraryFilterChip"
import {
  type ShiftLibraryGenreFacet,
  type ShiftLibrarySort,
  shiftLibrarySortLabel,
} from "./shift-library-query"

export interface ShiftLibraryFilterToolbarProps {
  readonly favoriteOnly: boolean
  readonly onToggleFavorite: () => void
  readonly facets: readonly ShiftLibraryGenreFacet[]
  readonly selectedGenres: readonly string[]
  readonly onToggleGenre: (genre: string) => void
  readonly sort: ShiftLibrarySort
  readonly onCycleSort: () => void
}

export function ShiftLibraryFilterToolbar({
  favoriteOnly,
  onToggleFavorite,
  facets,
  selectedGenres,
  onToggleGenre,
  sort,
  onCycleSort,
}: ShiftLibraryFilterToolbarProps) {
  return (
    <div
      className="shift-lib-bar"
      role="toolbar"
      aria-label="Filter and sort"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.filterToolbar)}
    >
      <ShiftLibraryFilterChip
        label="★ Favorites"
        active={favoriteOnly}
        onClick={onToggleFavorite}
      />
      {facets.map(facet => (
        <ShiftLibraryFilterChip
          key={facet.value}
          label={facet.value}
          count={facet.count}
          active={selectedGenres.includes(facet.value)}
          onClick={() => onToggleGenre(facet.value)}
        />
      ))}
      <ShiftLibraryFilterChip
        sort
        label={`Sort: ${shiftLibrarySortLabel(sort)}`}
        onClick={onCycleSort}
      />
    </div>
  )
}
