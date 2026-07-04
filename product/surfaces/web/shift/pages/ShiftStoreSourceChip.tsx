/**
 * Shift store — a source filter chip (atom).
 *
 * The toggle that narrows results to one remote source, and the sort-cycle chip
 * that shares its pill vocabulary. Toggles reflect selection through both
 * `aria-pressed` and `data-active`; the sort chip carries no pressed state (it
 * advances a cycle rather than toggling one facet).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreSourceChipProps {
  readonly label: string
  readonly onClick: () => void
  /** Toggle state; omitted for the sort chip (a cycle, not a toggle). */
  readonly active?: boolean
  /** Optional count badge (source chips). */
  readonly count?: number
  /** Render as the sort-cycle chip rather than a source toggle. */
  readonly sort?: boolean
}

export function ShiftStoreSourceChip({
  label,
  onClick,
  active,
  count,
  sort = false,
}: ShiftStoreSourceChipProps) {
  return (
    <button
      type="button"
      className={`shift-store-chip${sort ? " shift-store-chip-sort" : ""}`}
      data-active={!sort && active ? true : undefined}
      aria-pressed={sort ? undefined : Boolean(active)}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeChip)}
    >
      {label}
      {count !== undefined ? (
        <span className="shift-store-chip-count">{count}</span>
      ) : null}
    </button>
  )
}
