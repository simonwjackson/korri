export type GameStreamMode =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "exited"
  | "failed"

export interface GameStreamState {
  readonly mode: GameStreamMode
  readonly runId?: string
  readonly childPid?: number
  readonly exitCode?: number
  readonly failureStage?: GameStreamFailureStage
  readonly failureReason?: string
  readonly fullscreenRepaired?: boolean
}

export type GameStreamFailureStage =
  | "preflight"
  | "lock"
  | "spawn"
  | "fullscreen"
  | "cleanup"

export const initialGameStreamState: GameStreamState = { mode: "idle" }

export function canStartGameStream(state: GameStreamState): boolean {
  return state.mode === "idle" || state.mode === "exited" || state.mode === "failed"
}

export function beginGameStreamStart(
  state: GameStreamState,
  runId: string,
): GameStreamState {
  if (!canStartGameStream(state)) return state
  return { mode: "starting", runId }
}

export function markGameStreamRunning(
  state: GameStreamState,
  childPid: number,
): GameStreamState {
  return {
    ...state,
    mode: "running",
    childPid,
    failureStage: undefined,
    failureReason: undefined,
  }
}

export function markGameStreamFullscreenRepaired(
  state: GameStreamState,
): GameStreamState {
  return { ...state, fullscreenRepaired: true }
}

export function beginGameStreamStopping(state: GameStreamState): GameStreamState {
  if (state.mode !== "running" && state.mode !== "starting") return state
  return { ...state, mode: "stopping" }
}

export function completeGameStreamExit(
  state: GameStreamState,
  exitCode: number,
): GameStreamState {
  return {
    mode: "exited",
    runId: state.runId,
    exitCode,
    childPid: undefined,
    fullscreenRepaired: state.fullscreenRepaired,
  }
}

export function failGameStream(
  state: GameStreamState,
  input: {
    readonly stage: GameStreamFailureStage
    readonly reason: string
    readonly exitCode?: number
  },
): GameStreamState {
  return {
    mode: "failed",
    runId: state.runId,
    childPid: undefined,
    exitCode: input.exitCode,
    failureStage: input.stage,
    failureReason: input.reason,
    fullscreenRepaired: state.fullscreenRepaired,
  }
}
