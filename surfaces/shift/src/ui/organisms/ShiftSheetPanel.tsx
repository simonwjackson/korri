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
 *
 * Focus: the panel is an `lrud-container` with `data-block-exit`, so directional
 * input stays inside the sheet instead of wandering to the surface behind it,
 * and on open focus lands on the first real content control (not the close
 * button) so a single confirm runs the primary action.
 */
import { useSurfaceAction } from "../../host/surface-host"
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

  useSurfaceAction("back", () => {
    if (open) close()
  })

  // Move focus into the dialog when it opens, onto the first real content
  // control rather than the close button, so a single confirm runs the primary
  // action (e.g. Play) without navigating first.
  useEffect(() => {
    if (!open) return
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )
    const ordered = Array.from(focusables ?? [])
    const target =
      ordered.find(el => !el.classList.contains("shift-sheet-close")) ??
      ordered[0]
    target?.focus({ preventScroll: true })
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
        className="shift-sheet-panel lrud-container"
        data-side={side}
        data-block-exit="true"
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
