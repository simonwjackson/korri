export type KorriSessionMode =
  | "stopped"
  | "starting"
  | "home"
  | "launching"
  | "game"
  | "restoring"
  | "recovering"

export interface KorriSessionState {
  readonly mode: KorriSessionMode
  readonly launchId?: string
  readonly failureReason?: string
  readonly restoreAttempts: number
}

export interface KorriWindowSnapshot {
  readonly id: number
  readonly focused: boolean
  readonly fullscreen: boolean
  readonly appId?: string | null
  readonly title?: string | null
}

export interface HomeInvariantSnapshot {
  readonly windows: readonly KorriWindowSnapshot[]
}

export type HomeInvariantDecision =
  | { readonly kind: "noop"; readonly primaryWindowId: number }
  | { readonly kind: "relaunch-renderer"; readonly reason: "missing-window" }
  | {
      readonly kind: "repair-window"
      readonly windowId: number
      readonly repairs: readonly HomeInvariantRepair[]
    }
  | {
      readonly kind: "close-duplicate-windows"
      readonly primaryWindowId: number
      readonly duplicateWindowIds: readonly number[]
    }

export type HomeInvariantRepair = "focus" | "fullscreen"

const MAX_RESTORE_ATTEMPTS = 3

export const initialKorriSessionState: KorriSessionState = {
  mode: "stopped",
  restoreAttempts: 0,
}

export function shouldEnforceHomeInvariant(state: KorriSessionState): boolean {
  return state.mode === "home" || state.mode === "recovering"
}

export function startKorriSession(
  state: KorriSessionState = initialKorriSessionState,
): KorriSessionState {
  if (state.mode === "home") return state
  return { mode: "starting", restoreAttempts: 0 }
}

export function markKorriHome(state: KorriSessionState): KorriSessionState {
  return { ...state, mode: "home", failureReason: undefined }
}

export function beginKorriLaunch(
  state: KorriSessionState,
  launchId: string,
): KorriSessionState {
  if (state.mode !== "home") {
    return {
      ...state,
      mode: "recovering",
      failureReason: `cannot launch from ${state.mode}`,
    }
  }

  return { ...state, mode: "launching", launchId }
}

export function markKorriGameRunning(
  state: KorriSessionState,
): KorriSessionState {
  return { ...state, mode: "game" }
}

export function beginKorriRestore(state: KorriSessionState): KorriSessionState {
  return { ...state, mode: "restoring" }
}

export function completeKorriRestore(
  state: KorriSessionState,
): KorriSessionState {
  return {
    mode: "home",
    restoreAttempts: 0,
    launchId: state.launchId,
  }
}

export function failKorriRestore(
  state: KorriSessionState,
  reason: string,
): KorriSessionState {
  const restoreAttempts = state.restoreAttempts + 1
  return {
    ...state,
    mode: "recovering",
    restoreAttempts,
    failureReason: reason,
  }
}

export function shouldStopAfterRestoreFailure(
  state: KorriSessionState,
): boolean {
  return (
    state.mode === "recovering" && state.restoreAttempts >= MAX_RESTORE_ATTEMPTS
  )
}

export function stopKorriSession(): KorriSessionState {
  return initialKorriSessionState
}

export function evaluateHomeInvariant(
  snapshot: HomeInvariantSnapshot,
): readonly HomeInvariantDecision[] {
  const windows = [...snapshot.windows].sort((a, b) => a.id - b.id)
  if (windows.length === 0) {
    return [{ kind: "relaunch-renderer", reason: "missing-window" }]
  }

  const focused = windows.find(window => window.focused)
  const primary = focused ?? windows[0]
  const decisions: HomeInvariantDecision[] = []

  if (windows.length > 1) {
    decisions.push({
      kind: "close-duplicate-windows",
      primaryWindowId: primary.id,
      duplicateWindowIds: windows
        .filter(window => window.id !== primary.id)
        .map(window => window.id),
    })
  }

  const repairs: HomeInvariantRepair[] = []
  if (!primary.focused) repairs.push("focus")
  if (!primary.fullscreen) repairs.push("fullscreen")

  if (repairs.length > 0) {
    decisions.push({
      kind: "repair-window",
      windowId: primary.id,
      repairs,
    })
  }

  if (decisions.length === 0) {
    decisions.push({ kind: "noop", primaryWindowId: primary.id })
  }

  return decisions
}
