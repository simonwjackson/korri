/**
 * Shift sheet Panel — the sliding surface and its dismissal behaviour.
 *
 * Self-selects on the sheet's open state: renders nothing while closed, and when
 * open lays a scrim over the host surface with the panel anchored to `side`. It
 * owns dismissal — a press on the scrim, or the semantic `back` action while the
 * sheet is open, both close it; a press inside the panel does not. The panel is
 * absolutely positioned, so its host must be a positioned, clipping container
 * (add `shift-sheet-host`, as every Shift surface root already is).
 *
 * Input precedence: while open the sheet claims `back`. The `back` bus fans out
 * to every subscriber, so a host must gate its own `back` handling on the sheet
 * being closed (see `ShiftStoreDrawer`) to avoid double-handling.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { type ReactNode, useEffect, useRef } from "react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"
import { useShiftSheet } from "./ShiftSheet.context"

export interface ShiftSheetPanelProps {
  readonly children: ReactNode
}

export function ShiftSheetPanel({ children }: ShiftSheetPanelProps) {
  const { open, side, label, close } = useShiftSheet()
  const panelRef = useRef<HTMLElement>(null)

  useInputAction("back", () => {
    if (open) close()
  })

  // Move focus into the dialog when it opens so directional input lands in the
  // panel, not on the surface behind it. The first enabled control wins.
  useEffect(() => {
    if (!open) return
    panelRef.current
      ?.querySelector<HTMLElement>(
        "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
      )
      ?.focus({ preventScroll: true })
  }, [open])

  if (!open) return null

  return (
    <div
      className="shift-sheet-scrim"
      onPointerDown={close}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.sheet)}
    >
      <aside
        ref={panelRef}
        className="shift-sheet-panel"
        data-side={side}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onPointerDown={event => event.stopPropagation()}
        {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.sheetPanel)}
      >
        {children}
      </aside>
    </div>
  )
}
