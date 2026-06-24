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

import type { LaunchFailureKind } from "@platform/library/launcher"
import { useEffect, useRef } from "react"

export interface ShiftLaunchFailureBannerProps {
  readonly gameTitle: string
  readonly exitCode?: number
  readonly failureKind?: LaunchFailureKind
  readonly onRetry: () => void
  readonly onDismiss?: () => void
}

export function ShiftLaunchFailureBanner({
  gameTitle,
  exitCode,
  failureKind,
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

  const failureMessage = launchFailureMessage({ exitCode, failureKind })

  return (
    <div
      role="alert"
      data-shift-launch-failure
      className="mx-auto flex max-w-[var(--shift-measure-notice)] flex-wrap items-center justify-between gap-[var(--shift-space-3)] rounded-[var(--shift-radius-panel)] border border-[color:var(--shift-ink-faint)] bg-[color:var(--shift-surface-raised)] px-[var(--shift-space-3)] py-[var(--shift-space-2)] text-[color:var(--shift-ink)]"
    >
      <div className="flex flex-col gap-[var(--shift-space-1)]">
        <span className="text-[length:var(--shift-text-body)] font-semibold">
          Could not launch {gameTitle}
        </span>
        <span className="text-[length:var(--shift-text-fine)] opacity-80">
          {failureMessage}
        </span>
      </div>
      <div className="flex items-center gap-[var(--shift-space-1)]">
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-[var(--shift-radius-panel)] px-[var(--shift-space-2)] py-[var(--shift-space-1)] text-[length:var(--shift-text-fine)] opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        ) : null}
        <button
          ref={retryRef}
          type="button"
          onClick={onRetry}
          className="rounded-[var(--shift-radius-panel)] bg-[color:var(--shift-accent)] px-[var(--shift-space-2)] py-[var(--shift-space-1)] text-[length:var(--shift-text-fine)] font-semibold text-[color:var(--shift-on-accent)]"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

function launchFailureMessage({
  exitCode,
  failureKind,
}: {
  readonly exitCode: number | undefined
  readonly failureKind: LaunchFailureKind | undefined
}): string {
  const exitDetail = exitCode !== undefined ? ` (exit ${exitCode})` : ""
  switch (failureKind) {
    case "host-unavailable":
      return `No connected Korri server was available${exitDetail}.`
    case "moonlight-failed":
      return `Moonlight could not start or connect to the prepared stream${exitDetail}.`
    case "host-control-disabled":
    case "prepare-failed":
      return `The connected server could not prepare streams right now${exitDetail}.`
    case "no-such-game":
      return `The selected game is no longer available on the connected server${exitDetail}.`
    case "input-unavailable":
      return `Gamepad input was not available for this launch${exitDetail}.`
    case "input-ambiguous":
      return `Korri could not choose a gamepad for this launch${exitDetail}.`
    case "session-busy":
      return `Another stream session is already active${exitDetail}.`
    case "command-failed":
    case undefined:
      return `The game's launch command failed${exitDetail}.`
  }
}
