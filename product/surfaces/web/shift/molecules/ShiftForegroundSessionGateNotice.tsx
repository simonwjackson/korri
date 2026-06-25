import type { LaunchActionState } from "@platform/library/launch-action-state"
import type { ProviderLifecycleGateSummary } from "@platform/stream/foreground-session-gate-state"

export interface ShiftForegroundSessionGateNoticeProps {
  readonly state: Extract<
    LaunchActionState,
    { readonly _tag: "Blocked" | "AllowedWithUnknownStatus" | "Launching" }
  >
  readonly gameTitle?: string
  readonly providerLifecycle?: ProviderLifecycleGateSummary
}

export function ShiftForegroundSessionGateNotice({
  state,
  gameTitle,
  providerLifecycle,
}: ShiftForegroundSessionGateNoticeProps) {
  return (
    <div
      role={state._tag === "AllowedWithUnknownStatus" ? "status" : "alert"}
      data-shift-foreground-session-gate
      className="mx-auto flex max-w-[var(--shift-measure-notice)] flex-wrap items-center justify-between gap-[var(--shift-space-3)] rounded-[var(--shift-radius-panel)] border border-[color:var(--shift-ink-faint)] bg-[color:var(--shift-surface-raised)] px-[var(--shift-space-3)] py-[var(--shift-space-2)] text-[color:var(--shift-ink)]"
    >
      <div className="flex flex-col gap-[var(--shift-space-1)]">
        <span className="text-[length:var(--shift-text-body)] font-semibold">
          {titleFor(state)}
        </span>
        <span className="text-[length:var(--shift-text-fine)] opacity-80">
          {messageFor(state, gameTitle)}
        </span>
        {providerLifecycle ? (
          <span className="text-[length:var(--shift-text-fine)] uppercase tracking-[0.18em] text-[color:var(--shift-ink-dim)]">
            {providerLifecycle.displayMessage}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function titleFor(
  state: ShiftForegroundSessionGateNoticeProps["state"],
): string {
  switch (state._tag) {
    case "Launching":
      return "Starting stream"
    case "AllowedWithUnknownStatus":
      return "Session status unknown"
    case "Blocked":
      switch (state.reason) {
        case "preparing":
          return "Preparing stream"
        case "running":
          return "Stream already active"
        case "cooling":
          return "Cleaning up stream"
        case "recovering":
          return "Recovering stream session"
      }
  }
}

function messageFor(
  state: ShiftForegroundSessionGateNoticeProps["state"],
  gameTitle: string | undefined,
): string {
  const title = gameTitle ?? "the current game"
  switch (state._tag) {
    case "Launching":
      return `Korri is starting ${title}.`
    case "AllowedWithUnknownStatus":
      return "Korri could not read the live session status. Launch is still allowed and will be checked by the desktop owner."
    case "Blocked":
      switch (state.reason) {
        case "preparing":
          return `Korri is preparing ${title}; wait for the stream to finish starting.`
        case "running":
          return `${title} is already using the foreground session.`
        case "cooling":
          return `Korri is waiting for ${title} to finish cleanup before another launch.`
        case "recovering":
          return state.message
            ? `Korri is recovering the foreground session: ${state.message}`
            : "Korri is recovering the foreground session before another launch."
      }
  }
}
