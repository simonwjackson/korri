/**
 * Shift molecule — focus-tracking caption.
 *
 * Reads the focused playable and caption x-anchor from `useShiftHome()`
 * and renders the focused tile's title (with a relative last-played
 * label appended when the resume tile is focused).
 */

import { getPlayableDisplayName } from "@platform/library/playable-library-ui"
import { useShiftHome } from "../templates/ShiftHome.context"

function formatRelative(date: Date | undefined): string {
  if (!date) return "Never played"
  const ms = Date.now() - date.getTime()
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function userDataDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined
}

export function ShiftHomeCaption() {
  const { focused, isResumeFocused, captionAnchorX } = useShiftHome()
  const lastPlayed = userDataDate(focused.userData?.lastPlayed)
  const relativeLabel =
    isResumeFocused && lastPlayed ? formatRelative(lastPlayed) : undefined

  return (
    <div
      className="shift-home-caption shrink-0 px-[var(--shift-space-6)] pt-[var(--shift-space-1)] pb-[var(--shift-space-2)]"
      style={{ transform: `translateX(${captionAnchorX}px)` }}
    >
      <div className="flex flex-wrap items-baseline gap-[var(--shift-space-2)]">
        <span className="text-[length:var(--shift-text-heading)] font-semibold text-[color:var(--shift-ink)]">
          {getPlayableDisplayName(focused)}
        </span>
        {relativeLabel ? (
          <span className="text-[length:var(--shift-text-fine)] font-medium tracking-widest text-[color:var(--shift-ink-faint)] uppercase">
            {relativeLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}
