/**
 * Shift sheet Group — a titled section of rows inside a sheet body.
 *
 * A fixed command menu is long, so its rows are chunked into labelled groups
 * (Play, Organize, Content, Settings, Danger). This is presentation only — a
 * quiet header over its rows — not the branching/drill-down that sub-choices
 * will eventually need. Compose the rows (usually `ShiftSheetAction`) as
 * children.
 */
import type { ReactNode } from "react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

export interface ShiftSheetGroupProps {
  readonly title: string
  readonly children: ReactNode
}

export function ShiftSheetGroup({ title, children }: ShiftSheetGroupProps) {
  return (
    <div
      className="shift-sheet-group"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.sheetGroup)}
    >
      <span className="shift-sheet-group-title">{title}</span>
      <div className="shift-sheet-group-rows">{children}</div>
    </div>
  )
}
