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
      className="shift-home-caption shrink-0 px-12 pt-2 pb-3"
      style={{ transform: `translateX(${captionAnchorX}px)` }}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-3xl font-semibold text-[color:var(--shift-ink)]">
          {getPlayableDisplayName(focused)}
        </span>
        {relativeLabel ? (
          <span className="text-sm font-medium tracking-widest text-[color:var(--shift-ink-faint)] uppercase">
            {relativeLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}
