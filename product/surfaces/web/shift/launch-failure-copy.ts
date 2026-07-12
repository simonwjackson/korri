/**
 * Surface-side presentation of the launch lifecycle for the cinematic home.
 *
 * The service hands the surface a raw `LaunchState` (launching / accepted /
 * failed / defect / unavailable) plus the authoritative foreground-session
 * gate. This maps them to glanceable copy + the legend affordances the scene
 * should show. Failure detail (exitCode / stderrTail) never reaches the hero —
 * only a single calm reason line, per `failureKind`.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { LaunchFailureKind } from "@platform/library/launcher"
import type { ForegroundSessionGateState } from "@platform/session/foreground-session-gate-state"

export type LaunchStatusTone =
  | "launching"
  | "preparing"
  | "launched"
  | "cooling"
  | "recovering"
  | "failed"
  | "unavailable"

/**
 * In-progress tones (the launch is still resolving) should show a loading
 * indicator; the terminal tones (launched / failed / unavailable) should not.
 */
export function isLaunchInProgress(tone: LaunchStatusTone): boolean {
  return (
    tone === "launching" ||
    tone === "preparing" ||
    tone === "cooling" ||
    tone === "recovering"
  )
}

export interface LaunchStatusView {
  readonly tone: LaunchStatusTone
  /** Short, calm headline shown in place of the hero kicker. */
  readonly kicker: string
  /** One glanceable reason chip (failure/unavailable only). */
  readonly reason?: string
  /** Whether the scene should offer "A = Retry". */
  readonly canRetry: boolean
}

/** failureKind → one calm, human line. No codes, no stderr. */
const FAILURE_REASON: Record<LaunchFailureKind, string> = {
  "command-failed": "It didn't start",
  "host-unavailable": "That device is offline",
  "host-control-disabled": "That device won't allow remote play",
  "no-such-game": "We can't find this game",
  "prepare-failed": "Couldn't get it ready",
  "moonlight-failed": "Streaming didn't connect",
  "input-unavailable": "No controller detected",
  "input-ambiguous": "Pick a controller",
  "session-busy": "Another game is running",
  "fake-suspend-active": "Wake the device first",
  "hook-failed": "A launch hook didn't finish",
}

/** Kinds where retrying without changing anything is pointless. */
const NON_RETRYABLE: ReadonlySet<LaunchFailureKind> = new Set([
  "no-such-game",
  "host-control-disabled",
  "session-busy",
  "fake-suspend-active",
])

/**
 * Derive the in-scene launch view from a raw launch state. Returns null when
 * the scene should render its normal hero (Idle, or a release picker that this
 * slice does not handle).
 */
export function launchStatusView(
  state: LaunchState | undefined,
  foreground?: ForegroundSessionGateState,
): LaunchStatusView | null {
  // Terminal launch-request outcomes take precedence over the live gate.
  if (state?._tag === "Unavailable") {
    return {
      tone: "unavailable",
      kicker: "Not playable here",
      reason: "Unavailable on this device",
      canRetry: false,
    }
  }
  if (state?._tag === "Failed") {
    return {
      tone: "failed",
      kicker: "Couldn't start",
      reason: state.failureKind
        ? FAILURE_REASON[state.failureKind]
        : "It didn't start",
      canRetry: state.failureKind
        ? !NON_RETRYABLE.has(state.failureKind)
        : true,
    }
  }
  if (state?._tag === "Defect") {
    return {
      tone: "failed",
      kicker: "Couldn't start",
      reason: "Something went wrong",
      canRetry: true,
    }
  }

  // The initial request phase, before the daemon's session lifecycle takes over.
  if (state?._tag === "Launching") {
    return { tone: "launching", kicker: "Starting…", canRetry: false }
  }

  // Then follow the authoritative foreground-session lifecycle, so the launch is
  // observable through prepare → run → cool down → recover — surfacing the
  // provider's own human message when it supplies one.
  const providerMessage =
    foreground?.providerLifecycle?.displayMessage?.trim() || undefined
  switch (foreground?._tag) {
    case "Preparing":
      return {
        tone: "preparing",
        kicker:
          foreground.state === "Spawning"
            ? "Launching…"
            : foreground.state === "Foregrounding"
              ? "Bringing it up…"
              : "Getting it ready…",
        ...(providerMessage ? { reason: providerMessage } : {}),
        canRetry: false,
      }
    case "Running":
      return { tone: "launched", kicker: "Now playing", canRetry: false }
    case "Cooling":
      return {
        tone: "cooling",
        kicker: "Wrapping up…",
        ...(providerMessage ? { reason: providerMessage } : {}),
        canRetry: false,
      }
    case "Recovering":
      return {
        tone: "recovering",
        kicker: "Recovering…",
        reason:
          foreground.message?.trim() ||
          providerMessage ||
          "Getting things back in order",
        canRetry: false,
      }
    default:
      // Idle, Accepted, Ready, Unknown, LoadError, ReleaseSelectionRequired —
      // render the normal browsing hero.
      return null
  }
}
