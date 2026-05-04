/**
 * Shift molecule — top-bar status cluster.
 *
 * Decorative chrome plus optional status-row actions. Decorative status
 * items stay hidden from assistive tech (OS chrome already communicates
 * connectivity / battery state), while injected actions remain native
 * focusable controls. The cluster is kept narrow on purpose: time + a
 * small, fixed set of icons + the profile avatar. Adding new status
 * types is a deliberate decision, not a config-driven array.
 *
 * Layout is plain Tailwind utilities because layout (gap, font-size,
 * tone) is not Shift-identity-bearing — only the icon size and the
 * avatar ring are, and those live in `.shift-status-icon` /
 * `.shift-avatar` in shift.css.
 */

import { Battery, Sun, Wifi } from "lucide-react"
import type { ReactNode } from "react"
import { ShiftAvatar } from "../atoms/ShiftAvatar"
import { ShiftStatusIcon } from "../atoms/ShiftStatusIcon"

export interface ShiftStatusClusterProps {
  readonly time: string
  readonly avatarSrc: string
  readonly iconActions?: ReactNode
}

export function ShiftStatusCluster({
  time,
  avatarSrc,
  iconActions,
}: ShiftStatusClusterProps) {
  return (
    <div className="flex shrink-0 items-center gap-6 text-lg text-[color:var(--shift-ink-dim)]">
      <span aria-hidden className="text-xl font-bold tabular-nums">
        {time}
      </span>
      <div className="flex items-center gap-6">
        <ShiftStatusIcon icon={Sun} />
        {iconActions}
        <ShiftStatusIcon icon={Wifi} />
        <ShiftStatusIcon icon={Battery} />
        <ShiftAvatar src={avatarSrc} />
      </div>
    </div>
  )
}
