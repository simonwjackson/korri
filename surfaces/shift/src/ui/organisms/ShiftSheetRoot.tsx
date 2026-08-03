/**
 * Shift sheet Root — the controlled provider for a slide-out side sheet.
 *
 * The Root owns no open/closed state of its own: the sheet is contextual, so the
 * host holds "is it open, and about what" and passes `open` + `onClose` in. The
 * Root's job is to publish that (plus the anchoring side and the accessible
 * label) to every compound below through context. Compose the panel, header,
 * and body beneath it; the panel self-selects and renders nothing while closed.
 */

import type { ReactNode } from "react"
import { useMemo } from "react"
import { ShiftSheetProvider, type ShiftSheetSide } from "./ShiftSheet.context"

export interface ShiftSheetRootProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Accessible name for the dialog. */
  readonly label: string
  /** Edge to anchor and slide from. Defaults to the right. */
  readonly side?: ShiftSheetSide
  readonly children: ReactNode
}

export function ShiftSheetRoot({
  open,
  onClose,
  label,
  side = "right",
  children,
}: ShiftSheetRootProps) {
  const value = useMemo(
    () => ({ open, side, label, close: onClose }),
    [open, side, label, onClose],
  )

  return <ShiftSheetProvider value={value}>{children}</ShiftSheetProvider>
}
