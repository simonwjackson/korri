/**
 * Shift library — a filter/sort chip (atom).
 *
 * The one chip the Filter Bar variant stamps out: a toggle for Favorites, one
 * per genre (with a count badge), and the sort cycle (which toggles nothing,
 * just advances). `sort` chips carry no pressed state; toggles reflect `active`
 * through both `aria-pressed` and `data-active`.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftLibraryFilterChipProps {
  readonly label: string
  readonly onClick: () => void
  /** Toggle state; omitted for the sort chip (which is a cycle, not a toggle). */
  readonly active?: boolean
  /** Optional count badge (genre chips). */
  readonly count?: number
  /** Render as the sort-cycle chip rather than a toggle. */
  readonly sort?: boolean
}

export function ShiftLibraryFilterChip({
  label,
  onClick,
  active,
  count,
  sort = false,
}: ShiftLibraryFilterChipProps) {
  return (
    <button
      type="button"
      className={`shift-lib-chip${sort ? " shift-lib-chip-sort" : ""}`}
      data-active={!sort && active ? true : undefined}
      aria-pressed={sort ? undefined : Boolean(active)}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.filterChip)}
    >
      {label}
      {count !== undefined ? (
        <span className="shift-lib-chip-count">{count}</span>
      ) : null}
    </button>
  )
}
