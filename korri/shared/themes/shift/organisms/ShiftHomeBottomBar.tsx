/**
 * Shift organism — home bottom bar.
 *
 * A focusable Menu button on the left, the HUD cluster on the right.
 * Menu activation is delegated through `onMenuActivate` so a future
 * drawer overlay (out of scope here) plugs in at the page level
 * rather than inside the organism.
 */

import { ShiftMenuButton } from "../molecules/ShiftMenuButton"
import { ShiftHomeHudCluster } from "./ShiftHomeHudCluster"

export interface ShiftHomeBottomBarProps {
  readonly menuLabel?: string
  readonly onMenuActivate?: () => void
}

export function ShiftHomeBottomBar({
  menuLabel = "Menu",
  onMenuActivate,
}: ShiftHomeBottomBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-8 px-12 py-5">
      <ShiftMenuButton label={menuLabel} onActivate={onMenuActivate} />
      <ShiftHomeHudCluster />
    </div>
  )
}
