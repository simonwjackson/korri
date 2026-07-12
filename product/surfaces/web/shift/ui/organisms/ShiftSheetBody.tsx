/**
 * Shift sheet Body — the scrollable content region under the header.
 *
 * Source-agnostic: it lays out whatever the host composes (an action list, a
 * filter form, a settings group) and scrolls when the content outgrows the
 * panel. What goes inside is the host's business.
 */
import type { ReactNode } from "react"

export interface ShiftSheetBodyProps {
  readonly children: ReactNode
}

export function ShiftSheetBody({ children }: ShiftSheetBodyProps) {
  return <div className="shift-sheet-body">{children}</div>
}
