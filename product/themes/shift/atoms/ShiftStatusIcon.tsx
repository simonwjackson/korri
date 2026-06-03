/**
 * Shift atom — status-cluster icon wrapper.
 *
 * A thin adapter that applies the `.shift-status-icon` size and color
 * tone to a Lucide icon component. Used by the status cluster molecule
 * for sun, wifi, battery, and similar decorative chrome.
 *
 * Renders `aria-hidden` because the surrounding cluster is decorative
 * (the player learns connectivity / battery state from OS chrome, not
 * from the launcher). If a future Shift surface needs a status cue to
 * be announced, that surface should compose the underlying icon
 * directly with semantic markup rather than reach for this atom.
 */

import type { LucideIcon } from "lucide-react"

export interface ShiftStatusIconProps {
  readonly icon: LucideIcon
  readonly strokeWidth?: number
}

export function ShiftStatusIcon({
  icon: Icon,
  strokeWidth = 2,
}: ShiftStatusIconProps) {
  return (
    <Icon className="shift-status-icon" strokeWidth={strokeWidth} aria-hidden />
  )
}
