/**
 * Shift sheet Header — the panel's top row: a title slot plus a close control.
 *
 * The close button reads `close` from context so the header never needs the
 * handler drilled in. Pass the title (usually `ShiftSheetTitle`) as children.
 */
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { useShiftSheet } from "./ShiftSheet.context"

export interface ShiftSheetHeaderProps {
  readonly children: ReactNode
}

export function ShiftSheetHeader({ children }: ShiftSheetHeaderProps) {
  const { close } = useShiftSheet()

  return (
    <div className="shift-sheet-head">
      <div className="shift-sheet-head-slot">{children}</div>
      <button
        type="button"
        className="shift-sheet-close"
        aria-label="Close"
        onClick={close}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  )
}
