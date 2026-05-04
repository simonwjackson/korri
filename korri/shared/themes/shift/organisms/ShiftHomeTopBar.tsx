/**
 * Shift organism — home top bar.
 *
 * Decorative chrome above the rail: a focusable search pill on the
 * left, a decorative status cluster on the right. Search activation
 * is an opt-in callback so a future iteration can wire it to the
 * input bus or a router push without changing the organism's API.
 *
 * Time and avatar are required props (not pulled from a global) so
 * Storybook stories and product routes can supply deterministic
 * values without touching a context. The home page composes them
 * from whatever data source it owns.
 *
 * Vertical sizing: outer wrapper owns `px-12 py-5`; inner row reserves
 * `--shift-home-bar-content-h` so the bar's height is
 * padding + bar-content-h. The same contract applies to ShiftHomeBottomBar
 * so the two bars total the same height regardless of what they hold.
 */

import { ShiftSearchPill } from "../molecules/ShiftSearchPill"
import { ShiftStatusCluster } from "../molecules/ShiftStatusCluster"

export interface ShiftHomeTopBarProps {
  readonly time: string
  readonly avatarSrc: string
  readonly searchPlaceholder?: string
  readonly searchAriaLabel?: string
  readonly onSearchActivate?: () => void
}

export function ShiftHomeTopBar({
  time,
  avatarSrc,
  searchPlaceholder = "Search for games, genres, or tags…",
  searchAriaLabel = "Search for games, genres, or tags",
  onSearchActivate,
}: ShiftHomeTopBarProps) {
  return (
    <div className="flex shrink-0 flex-col px-12 py-5">
      <div className="flex min-h-[var(--shift-home-bar-content-h)] items-center justify-between gap-6">
        <ShiftSearchPill
          placeholder={searchPlaceholder}
          ariaLabel={searchAriaLabel}
          onActivate={onSearchActivate}
        />
        <ShiftStatusCluster time={time} avatarSrc={avatarSrc} />
      </div>
    </div>
  )
}
