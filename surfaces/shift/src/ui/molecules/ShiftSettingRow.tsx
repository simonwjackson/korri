/**
 * Shift settings Row — one readable fact, label left and value right.
 *
 * Anatomy and focus behaviour come from the sheet's action row (full width,
 * pill lift on focus), but this row is deliberately NOT a button: settings are
 * read-only today, and a control that depresses without doing anything promises
 * something Korri cannot deliver.
 *
 * It is still focusable, because focus is how a handheld reads a list longer
 * than its screen: moving focus is the reading position, and the page scrolls
 * to follow it. The legend on the settings page therefore offers Back only —
 * no Select — so no button is advertised that does nothing.
 */
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export interface ShiftSettingRowProps {
  readonly label: string
  /** Position in the page's flat focus order; drives the scroll math. */
  readonly index: number
  /** Current state as display text. Absent renders the label alone. */
  readonly value?: string
  /** One-line explanation, shown under the label. */
  readonly description?: string
  /** The row currently under the reading band. */
  readonly focused?: boolean
  readonly onFocus?: () => void
}

export function ShiftSettingRow({
  label,
  index,
  value,
  description,
  focused = false,
  onFocus,
}: ShiftSettingRowProps) {
  return (
    <div
      className="shift-setting-row"
      data-setting-index={index}
      data-focused={focused || undefined}
      tabIndex={0}
      role="group"
      aria-label={value === undefined ? label : `${label}: ${value}`}
      onFocus={onFocus}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.settingRow, label)}
    >
      <span className="shift-setting-row-text">
        <span className="shift-setting-row-label">{label}</span>
        {description ? (
          <span className="shift-setting-row-description">{description}</span>
        ) : null}
      </span>
      {value === undefined ? null : (
        <span className="shift-setting-row-value">{value}</span>
      )}
    </div>
  )
}
