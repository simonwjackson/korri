/**
 * Shift molecule — top-bar status cluster.
 *
 * Decorative chrome only; everything in here is `aria-hidden` because
 * a player on a TV does not need this row read aloud (OS chrome
 * already communicates connectivity / battery state). The cluster is
 * kept narrow on purpose: time + a small, fixed set of icons + the
 * profile avatar. Adding new status types is a deliberate decision,
 * not a config-driven array.
 *
 * Layout is plain Tailwind utilities because layout (gap, font-size,
 * tone) is not Shift-identity-bearing — only the icon size and the
 * avatar ring are, and those live in `.shift-status-icon` /
 * `.shift-avatar` in shift.css.
 */

import { Battery, Sun, Wifi } from "lucide-react"
import { ShiftAvatar } from "../atoms/ShiftAvatar"
import { ShiftStatusIcon } from "../atoms/ShiftStatusIcon"

export interface ShiftStatusClusterProps {
  readonly time: string
  readonly avatarSrc: string
}

export function ShiftStatusCluster({
  time,
  avatarSrc,
}: ShiftStatusClusterProps) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center gap-6 text-lg text-[color:var(--shift-ink-dim)]"
    >
      <span className="text-xl font-bold tabular-nums">{time}</span>
      <ShiftStatusIcon icon={Sun} />
      <ShiftStatusIcon icon={Wifi} />
      <ShiftStatusIcon icon={Battery} />
      <ShiftAvatar src={avatarSrc} />
    </div>
  )
}
