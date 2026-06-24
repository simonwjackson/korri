/**
 * Shift organism — home bottom bar.
 *
 * A focusable Menu button on the left, the HUD cluster on the right.
 * Menu activation is delegated through `onMenuActivate` so a future
 * drawer overlay (out of scope here) plugs in at the page level
 * rather than inside the organism.
 *
 * Vertical sizing mirrors the home top bar: same outer `px-12 py-5`,
 * plus an inner content row with `min-h-[var(--shift-home-bar-content-h)]`.
 * The same token drives the search pill height on the top bar, so the
 * two bars total the same height (padding + bar-content-h) by contract,
 * not by parallel magic numbers. Edit `--shift-home-bar-content-h` in
 * shift.css to retune both bars in one place.
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
    <div className="flex shrink-0 flex-col px-[var(--shift-space-6)] py-[var(--shift-space-3)]">
      <div className="flex min-h-[var(--shift-home-bar-content-h)] flex-wrap items-center justify-between gap-[var(--shift-space-4)]">
        <ShiftMenuButton label={menuLabel} onActivate={onMenuActivate} />
        <ShiftHomeHudCluster />
      </div>
    </div>
  )
}
