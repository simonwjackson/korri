/**
 * Surface-side presentation of the launch lifecycle for the cinematic home.
 *
 * The service hands the surface a raw `LaunchState` (launching / launched /
 * failed / defect / unavailable); this maps it to glanceable copy + the legend
 * affordances the scene should show. Failure detail (exitCode / stderrTail)
 * never reaches the hero — only a single calm reason line, per `failureKind`.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { LaunchFailureKind } from "@platform/library/launcher"

export type LaunchStatusTone =
  | "launching"
  | "launched"
  | "failed"
  | "unavailable"

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
}

/** Kinds where retrying without changing anything is pointless. */
const NON_RETRYABLE: ReadonlySet<LaunchFailureKind> = new Set([
  "no-such-game",
  "host-control-disabled",
  "session-busy",
])

/**
 * Derive the in-scene launch view from a raw launch state. Returns null when
 * the scene should render its normal hero (Idle, or a release picker that this
 * slice does not handle).
 */
export function launchStatusView(
  state: LaunchState | undefined,
): LaunchStatusView | null {
  if (!state) return null
  switch (state._tag) {
    case "Launching":
      return { tone: "launching", kicker: "Starting…", canRetry: false }
    case "Launched":
      return { tone: "launched", kicker: "Now playing", canRetry: false }
    case "Unavailable":
      return {
        tone: "unavailable",
        kicker: "Not playable here",
        reason: "Unavailable on this device",
        canRetry: false,
      }
    case "Failed":
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
    case "Defect":
      return {
        tone: "failed",
        kicker: "Couldn't start",
        reason: "Something went wrong",
        canRetry: true,
      }
    default:
      // Idle, ReleaseSelectionRequired — render the normal hero.
      return null
  }
}
