/**
 * Shift molecule — focus-tracking caption.
 *
 * Reads the focused game and caption x-anchor from `useShiftHome()`
 * and renders the focused tile's title (with a relative last-played
 * label appended when the resume tile is focused).
 *
 * Position update is a single inline transform set from JS. There is
 * no CSS transition on transform — the caption snaps instantly to the
 * focused tile's x-position. A smooth slide reads as the caption
 * chasing the focus halo rather than belonging to the focused tile.
 * See docs/solutions/best-practices/attached-ui-snaps-not-slides-2026-05-01.md.
 */

import { getGameDisplayName } from "@shared/fixtures/games/game"
import { useShiftHome } from "../templates/ShiftHome.context"

/**
 * Compact relative-time label. UTC arithmetic on the underlying epoch
 * means the label does not flap across DST or timezone boundaries the
 * way locale-aware methods would.
 */
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

export function ShiftHomeCaption() {
  const { focused, isResumeFocused, captionAnchorX } = useShiftHome()
  const lastPlayed = focused.userData?.lastPlayed
  const relativeLabel =
    isResumeFocused && lastPlayed ? formatRelative(lastPlayed) : undefined

  return (
    <div
      className="shift-home-caption shrink-0 px-12 pt-2 pb-3"
      style={{ transform: `translateX(${captionAnchorX}px)` }}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-3xl font-semibold text-[color:var(--shift-ink)]">
          {getGameDisplayName(focused)}
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
