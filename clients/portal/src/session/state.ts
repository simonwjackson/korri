import type {
  StreamFailureReason,
  StreamLifecycleEvent,
  StreamStageId,
} from "@contracts/bridge/korri-native-bridge"

/**
 * Stream session lifecycle state. Treaty events (snapshot replay plus
 * pushes) are folded into this ADT at the seam; the session screen never
 * inspects raw bridge payloads.
 *
 * The fold is monotonic: replayed or duplicate events never move the
 * timeline backwards, and `Connected` / `Failed` / `Ended` are terminal
 * for stage progress.
 */

/** Canonical stage order, derived from the treaty's `StreamStageId`. */
export const STAGE_ORDER: readonly StreamStageId[] = [
  "launching-app",
  "initializing",
  "handshaking",
  "establishing-streams",
]

export type SessionLifecycleState =
  | {
      readonly _tag: "Connecting"
      readonly currentStage: StreamStageId | null
      readonly completed: readonly StreamStageId[]
      readonly detail: string | null
    }
  | { readonly _tag: "Connected" }
  | {
      readonly _tag: "Failed"
      readonly reason: StreamFailureReason
      readonly stage: StreamStageId | null
      readonly errorCode: number
      readonly detail: string | null
    }
  | { readonly _tag: "Ended" }

export interface StageRow {
  readonly stage: StreamStageId
  readonly status: "pending" | "active" | "done"
}

const stageIndex = (stage: StreamStageId): number => STAGE_ORDER.indexOf(stage)

export const SessionLifecycleState = {
  initial: (): SessionLifecycleState => ({
    _tag: "Connecting",
    currentStage: null,
    completed: [],
    detail: null,
  }),

  applyEvent: (
    state: SessionLifecycleState,
    event: StreamLifecycleEvent,
  ): SessionLifecycleState => {
    // Failure always wins; everything else is ignored once terminal.
    if (state._tag === "Failed" || state._tag === "Ended") return state
    if (event.type === "failed") {
      return {
        _tag: "Failed",
        reason: event.reason,
        stage: event.stage,
        errorCode: event.errorCode,
        detail: event.detail ?? null,
      }
    }
    if (event.type === "terminated") {
      return event.graceful
        ? { _tag: "Ended" }
        : {
            _tag: "Failed",
            reason: event.reason,
            stage: null,
            errorCode: event.errorCode,
            detail: null,
          }
    }
    if (state._tag === "Connected") return state
    if (event.type === "connected") return { _tag: "Connected" }

    const highestSeen = Math.max(
      state.currentStage === null ? -1 : stageIndex(state.currentStage),
      ...state.completed.map(stageIndex),
    )
    if (event.type === "stage-starting") {
      // Replay/duplicate guard: never move backwards.
      if (stageIndex(event.stage) <= highestSeen) return state
      return {
        ...state,
        currentStage: event.stage,
        detail: event.detail ?? null,
      }
    }
    // stage-complete: record it (idempotently) without regressing.
    if (state.completed.includes(event.stage)) return state
    if (stageIndex(event.stage) < highestSeen) return state
    return {
      ...state,
      completed: [...state.completed, event.stage],
      currentStage:
        state.currentStage === event.stage ? null : state.currentStage,
      detail: null,
    }
  },

  fromEvents: (
    events: readonly StreamLifecycleEvent[],
  ): SessionLifecycleState =>
    events.reduce(
      SessionLifecycleState.applyEvent,
      SessionLifecycleState.initial(),
    ),

  /** Derive render rows for the fixed timeline from a connecting state. */
  stageRows: (
    state: Extract<SessionLifecycleState, { _tag: "Connecting" }>,
  ): readonly StageRow[] =>
    STAGE_ORDER.map(stage => ({
      stage,
      status: state.completed.includes(stage)
        ? "done"
        : state.currentStage === stage
          ? "active"
          : "pending",
    })),
}

/**
 * Scripted timeline for browser dev, where no `KorriSession` surface
 * exists. Folding it end-to-end reaches `Connected`; the screen plays it
 * back with delays to preview the real progression.
 */
export const FIXTURE_TIMELINE_EVENTS: readonly StreamLifecycleEvent[] = [
  { type: "stage-starting", stage: "launching-app", detail: "Fixture Game" },
  { type: "stage-complete", stage: "launching-app" },
  { type: "stage-starting", stage: "initializing" },
  { type: "stage-complete", stage: "initializing" },
  { type: "stage-starting", stage: "handshaking" },
  { type: "stage-complete", stage: "handshaking" },
  { type: "stage-starting", stage: "establishing-streams" },
  { type: "stage-complete", stage: "establishing-streams" },
  { type: "connected" },
]
