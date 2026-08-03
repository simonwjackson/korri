/**
 * Shift sheet Action — one selectable row in a menu-style sheet (molecule).
 *
 * The dominant sheet content is a list of things you can do to whatever the
 * sheet is about: Play, Favourite, Tweak settings, Remove. Each row is a native
 * focusable button so directional input and pointers both reach it. `tone` is a
 * small labelled union — `danger` marks destructive rows (e.g. Remove) — kept
 * enumerable rather than a boolean forest. `disabled` rows render present but
 * inert (dim, and skipped by focus) so a fixed command surface can show every
 * action while only the wired, applicable ones respond.
 */
import type { ReactNode } from "react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export type ShiftSheetActionTone = "default" | "danger"

export interface ShiftSheetActionProps {
  readonly label: string
  readonly onSelect: () => void
  readonly icon?: ReactNode
  readonly tone?: ShiftSheetActionTone
  readonly disabled?: boolean
}

export function ShiftSheetAction({
  label,
  onSelect,
  icon,
  tone = "default",
  disabled = false,
}: ShiftSheetActionProps) {
  return (
    <button
      type="button"
      className="shift-sheet-action"
      data-tone={tone}
      disabled={disabled}
      onClick={onSelect}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.sheetAction, label)}
    >
      {icon ? (
        <span className="shift-sheet-action-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="shift-sheet-action-label">{label}</span>
    </button>
  )
}
