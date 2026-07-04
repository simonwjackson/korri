/**
 * Shift store — a filter chip (atom).
 *
 * The one selectable filter unit the store's refine surfaces stamp out. It
 * reflects selection through both `aria-pressed` and `data-active`, carries an
 * optional count badge, and exposes a `variant` family — the chip candidates
 * under exploration — so each refine group can wear the presentation that fits
 * its semantics (a caret for pick-one sorts, an underline for view lenses, an
 * LED dot for checklist rows, pure type or kicker caps for facet clouds).
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export type ShiftStoreChipVariant =
  | "pill"
  | "underline"
  | "dot"
  | "kicker"
  | "cursor"
  | "type"

export interface ShiftStoreSourceChipProps {
  readonly label: string
  readonly onClick: () => void
  /** Selected state. */
  readonly active?: boolean
  /** Optional count badge. */
  readonly count?: number
  /** Presentation family. Default "pill" (the finder strip's look). */
  readonly variant?: ShiftStoreChipVariant
}

export function ShiftStoreSourceChip({
  label,
  onClick,
  active,
  count,
  variant = "pill",
}: ShiftStoreSourceChipProps) {
  return (
    <button
      type="button"
      className="shift-store-chip"
      data-variant={variant}
      data-active={active ? true : undefined}
      aria-pressed={Boolean(active)}
      onClick={onClick}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeChip)}
    >
      <span className="shift-store-chip-label">{label}</span>
      {count !== undefined ? (
        <span className="shift-store-chip-count">{count}</span>
      ) : null}
    </button>
  )
}
