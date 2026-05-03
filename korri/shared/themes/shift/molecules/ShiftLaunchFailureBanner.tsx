/**
 * Shift molecule — launch failure banner.
 *
 * Pure presentational. Renders a banner above the home rail when a launch
 * has failed; provides a focused retry button so the player can fire
 * confirm without thumbstick travel.
 *
 * Composition responsibilities:
 *   - The banner is shown only when `LaunchState._tag === "Failed"`;
 *     that gating happens at the composition site (`ShiftHomePage`).
 *   - The banner does not own retry state; `onRetry` is wired to the
 *     hook's `retry()`.
 *   - When the banner mounts, focus moves to the retry button on the
 *     first render so the player can confirm-to-retry without further
 *     spatial navigation.
 *   - The banner is positioned inline above the rail so the rail keeps
 *     its tile, focus, and position behind the banner — satisfying the
 *     SGR-R7 "anchored to the same game/context" promise.
 *
 * See docs/solutions/best-practices/attached-ui-snaps-not-slides-2026-05-01.md
 * for the calm motion grammar this banner inherits — no slide-in.
 */

import { useEffect, useRef } from "react"

export interface ShiftLaunchFailureBannerProps {
  readonly gameTitle: string
  readonly exitCode?: number
  readonly onRetry: () => void
  readonly onDismiss?: () => void
}

export function ShiftLaunchFailureBanner({
  gameTitle,
  exitCode,
  onRetry,
  onDismiss,
}: ShiftLaunchFailureBannerProps) {
  const retryRef = useRef<HTMLButtonElement | null>(null)

  // Move focus to the retry button when the banner first renders so the
  // player's next confirm activates retry, not a fresh launch from the
  // rail behind it.
  useEffect(() => {
    retryRef.current?.focus()
  }, [])

  const exitDetail = exitCode !== undefined ? ` (exit ${exitCode})` : ""

  return (
    <div
      role="alert"
      data-shift-launch-failure
      className="mx-auto flex max-w-2xl items-center justify-between gap-6 rounded-lg border border-[color:var(--shift-ink-faint)] bg-[color:var(--shift-surface-raised)] px-6 py-3 text-[color:var(--shift-ink)]"
    >
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          Could not launch {gameTitle}
        </span>
        <span className="text-sm opacity-80">
          The game's launch command failed{exitDetail}.
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded px-3 py-1 text-sm opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        ) : null}
        <button
          ref={retryRef}
          type="button"
          onClick={onRetry}
          className="rounded bg-[color:var(--shift-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--shift-on-accent)]"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
