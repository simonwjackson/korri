import type { LaunchActionState } from "@shared/library/launch-action-state"

export interface ShiftForegroundSessionGateNoticeProps {
  readonly state: Extract<
    LaunchActionState,
    { readonly _tag: "Blocked" | "AllowedWithUnknownStatus" | "Launching" }
  >
  readonly gameTitle?: string
}

export function ShiftForegroundSessionGateNotice({
  state,
  gameTitle,
}: ShiftForegroundSessionGateNoticeProps) {
  return (
    <div
      role={state._tag === "AllowedWithUnknownStatus" ? "status" : "alert"}
      data-shift-foreground-session-gate
      className="mx-auto flex max-w-2xl items-center justify-between gap-6 rounded-lg border border-[color:var(--shift-ink-faint)] bg-[color:var(--shift-surface-raised)] px-6 py-3 text-[color:var(--shift-ink)]"
    >
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">{titleFor(state)}</span>
        <span className="text-sm opacity-80">
          {messageFor(state, gameTitle)}
        </span>
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
