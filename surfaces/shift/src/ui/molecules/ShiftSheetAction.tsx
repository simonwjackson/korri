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
  readonly controlId?: string
  readonly description?: string
  readonly icon?: ReactNode
  readonly tone?: ShiftSheetActionTone
  readonly disabled?: boolean
  /** When present, an unavailable row remains focusable so its explanation is reachable. */
  readonly disabledReason?: string
}

export function ShiftSheetAction({
  label,
  onSelect,
  controlId,
  description,
  icon,
  tone = "default",
  disabled = false,
  disabledReason,
}: ShiftSheetActionProps) {
  const explainable = disabled && disabledReason !== undefined
  const id = controlId === undefined ? undefined : `gameplay-control-${controlId}`
  const descriptionId = description !== undefined && id ? `${id}-description` : undefined
  const reasonId = explainable && id ? `${id}-reason` : undefined
  const describedBy = [descriptionId, reasonId].filter(Boolean).join(" ") || undefined
  return (
    <button
      id={id}
      type="button"
      className="shift-sheet-action"
      data-tone={tone}
      disabled={disabled && !explainable}
      aria-label={label}
      aria-disabled={disabled}
      aria-describedby={describedBy}
      onClick={() => {
        if (!disabled) onSelect()
      }}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.sheetAction, label)}
    >
      {icon ? (
        <span className="shift-sheet-action-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="shift-sheet-action-copy">
        <span className="shift-sheet-action-label">{label}</span>
        {description ? (
          <span id={descriptionId} className="shift-sheet-control-description">
            {description}
          </span>
        ) : null}
        {explainable ? (
          <span id={reasonId} className="shift-sheet-control-description">
            {disabledReason}
          </span>
        ) : null}
      </span>
    </button>
  )
}
