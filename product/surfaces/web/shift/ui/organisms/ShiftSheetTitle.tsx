/**
 * Shift sheet Title — the sheet's heading text.
 *
 * A thin typographic atom so hosts style the heading consistently without
 * knowing the sheet's class names.
 */
import type { ReactNode } from "react"

export interface ShiftSheetTitleProps {
  readonly children: ReactNode
}

export function ShiftSheetTitle({ children }: ShiftSheetTitleProps) {
  return <span className="shift-sheet-title">{children}</span>
}
