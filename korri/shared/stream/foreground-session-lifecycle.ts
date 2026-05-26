export type ForegroundSessionStateTag =
  | "IdleReady"
  | "Preparing"
  | "Spawning"
  | "Foregrounding"
  | "Running"
  | "ExitObserved"
  | "TearingDown"
  | "VerifyingReady"
  | "Failed"
  | "Recovering"

export type ForegroundSessionFailureStage =
  | "accept"
  | "prepare"
  | "spawn"
  | "foreground"
  | "exit"
  | "cleanup"
  | "readiness"
  | "adapter"

export interface ForegroundSessionRequestIdentity {
  readonly requestId: string
  readonly gameId: string
  readonly hostId?: string
}

export interface ForegroundSessionChildIdentity {
  readonly id: string
  readonly processId?: number
}

export type ForegroundSessionTerminalStatus =
  | { readonly _tag: "Exited"; readonly exitCode: number | null }
  | { readonly _tag: "Signaled"; readonly signal: string }
  | { readonly _tag: "Terminated" }
  | { readonly _tag: "Failed"; readonly message: string }

export type ForegroundSessionEvidence = Readonly<Record<string, unknown>>

export interface ForegroundSessionActiveSession
  extends ForegroundSessionRequestIdentity {
  readonly sessionId?: string
  readonly child?: ForegroundSessionChildIdentity
  readonly terminal?: ForegroundSessionTerminalStatus
  readonly foregroundEvidence?: readonly ForegroundSessionEvidence[]
  readonly adapterEvidence?: readonly ForegroundSessionEvidence[]
}

export interface ForegroundSessionFailure {
  readonly stage: ForegroundSessionFailureStage
  readonly message: string
  readonly evidence?: ForegroundSessionEvidence
}

export type ForegroundSessionState =
  | { readonly _tag: "IdleReady" }
  | { readonly _tag: "Preparing"; readonly active: ForegroundSessionActiveSession }
  | { readonly _tag: "Spawning"; readonly active: ForegroundSessionActiveSession }
  | { readonly _tag: "Foregrounding"; readonly active: ForegroundSessionActiveSession }
  | { readonly _tag: "Running"; readonly active: ForegroundSessionActiveSession }
  | { readonly _tag: "ExitObserved"; readonly active: ForegroundSessionActiveSession }
  | { readonly _tag: "TearingDown"; readonly active: ForegroundSessionActiveSession }
  | { readonly _tag: "VerifyingReady"; readonly active: ForegroundSessionActiveSession }
  | {
      readonly _tag: "Failed"
      readonly active?: ForegroundSessionActiveSession
      readonly failure: ForegroundSessionFailure
    }
  | {
      readonly _tag: "Recovering"
      readonly active?: ForegroundSessionActiveSession
      readonly failure: ForegroundSessionFailure
    }

export type ForegroundSessionEvent =
  | {
      readonly _tag: "ForegroundSessionLaunchAccepted"
      readonly requestId: string
      readonly gameId: string
      readonly hostId?: string
    }
  | {
      readonly _tag: "ForegroundSessionLaunchRejected"
      readonly requestId: string
      readonly gameId: string
      readonly rejection: ForegroundSessionBusyRejection
    }
  | {
      readonly _tag: "ForegroundSessionStateChanged"
      readonly previousState: ForegroundSessionStateTag
      readonly nextState: ForegroundSessionStateTag
      readonly requestId?: string
      readonly evidence?: ForegroundSessionEvidence
    }
  | {
      readonly _tag: "ForegroundSessionAdapterOutcome"
      readonly requestId: string
      readonly stage: string
      readonly status: "ok" | "warning" | "failed"
      readonly evidence?: ForegroundSessionEvidence
    }
  | {
      readonly _tag: "ForegroundSessionForegroundWarning"
      readonly requestId: string
      readonly message: string
      readonly evidence?: ForegroundSessionEvidence
    }
  | {
      readonly _tag: "ForegroundSessionExited"
      readonly requestId: string
      readonly terminal: ForegroundSessionTerminalStatus
      readonly evidence?: ForegroundSessionEvidence
    }
  | {
      readonly _tag: "ForegroundSessionReady"
      readonly previousRequestId?: string
      readonly evidence?: ForegroundSessionEvidence
    }

export interface ForegroundSessionBusyRejection {
  readonly category: "session-busy"
  readonly message: string
  readonly attemptedRequestId: string
  readonly attemptedGameId: string
  readonly currentState: ForegroundSessionStateTag
  readonly currentRequestId?: string
  readonly currentGameId?: string
  readonly currentSessionId?: string
  readonly currentChildId?: string
}

export type ForegroundSessionAcceptResult =
  | {
      readonly _tag: "Accepted"
      readonly state: Extract<ForegroundSessionState, { readonly _tag: "Preparing" }>
      readonly active: ForegroundSessionActiveSession
      readonly event: Extract<
        ForegroundSessionEvent,
        { readonly _tag: "ForegroundSessionLaunchAccepted" }
      >
    }
  | {
      readonly _tag: "Rejected"
      readonly state: ForegroundSessionState
      readonly rejection: ForegroundSessionBusyRejection
      readonly event: Extract<
        ForegroundSessionEvent,
        { readonly _tag: "ForegroundSessionLaunchRejected" }
      >
    }

export const foregroundSessionState = {
  idleReady: (): ForegroundSessionState => ({ _tag: "IdleReady" }),
  preparing: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "Preparing", active: input.active }),
  spawning: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "Spawning", active: input.active }),
  foregrounding: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "Foregrounding", active: input.active }),
  running: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "Running", active: input.active }),
  exitObserved: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "ExitObserved", active: input.active }),
  tearingDown: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "TearingDown", active: input.active }),
  verifyingReady: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "VerifyingReady", active: input.active }),
  failed: (input: {
    readonly active?: ForegroundSessionActiveSession
    readonly failure: ForegroundSessionFailure
  }): ForegroundSessionState => ({
    _tag: "Failed",
    active: input.active,
    failure: input.failure,
  }),
  recovering: (input: {
    readonly active?: ForegroundSessionActiveSession
    readonly failure: ForegroundSessionFailure
  }): ForegroundSessionState => ({
    _tag: "Recovering",
    active: input.active,
    failure: input.failure,
  }),
} as const

export const initialForegroundSessionState = foregroundSessionState.idleReady()

export function isForegroundSessionLaunchAccepting(
  state: ForegroundSessionState,
): boolean {
  return state._tag === "IdleReady"
}

export function acceptForegroundSessionLaunch(
  state: ForegroundSessionState,
  request: ForegroundSessionRequestIdentity,
): ForegroundSessionAcceptResult {
  if (!isForegroundSessionLaunchAccepting(state)) {
    const rejection = foregroundSessionBusyRejection(state, request)
    return {
      _tag: "Rejected",
      state,
      rejection,
      event: createForegroundSessionEvent({
        _tag: "ForegroundSessionLaunchRejected",
        requestId: request.requestId,
        gameId: request.gameId,
        rejection,
      }),
    }
  }

  const active: ForegroundSessionActiveSession = { ...request }
  return {
    _tag: "Accepted",
    state: { _tag: "Preparing", active },
    active,
    event: createForegroundSessionEvent({
      _tag: "ForegroundSessionLaunchAccepted",
      requestId: request.requestId,
      gameId: request.gameId,
      ...(request.hostId ? { hostId: request.hostId } : {}),
    }),
  }
}

export function foregroundSessionBusyRejection(
  state: ForegroundSessionState,
  request: ForegroundSessionRequestIdentity,
): ForegroundSessionBusyRejection {
  const active = activeSessionFromState(state)
  return {
    category: "session-busy",
    message: `Foreground session is not ready (${state._tag})`,
    attemptedRequestId: request.requestId,
    attemptedGameId: request.gameId,
    currentState: state._tag,
    ...(active?.requestId ? { currentRequestId: active.requestId } : {}),
    ...(active?.gameId ? { currentGameId: active.gameId } : {}),
    ...(active?.sessionId ? { currentSessionId: active.sessionId } : {}),
    ...(active?.child?.id ? { currentChildId: active.child.id } : {}),
  }
}

export function foregroundSessionTransition(
  state: ForegroundSessionState,
  nextState: Exclude<ForegroundSessionStateTag, "IdleReady">,
  input: {
    readonly active?: ForegroundSessionActiveSession
    readonly failure?: ForegroundSessionFailure
    readonly evidence?: ForegroundSessionEvidence
  } = {},
): {
  readonly state: ForegroundSessionState
  readonly event: Extract<
    ForegroundSessionEvent,
    { readonly _tag: "ForegroundSessionStateChanged" }
  >
} {
  const active = input.active ?? activeSessionFromState(state)
  const transitioned = stateForTag(nextState, active, input.failure)
  return {
    state: transitioned,
    event: createForegroundSessionEvent({
      _tag: "ForegroundSessionStateChanged",
      previousState: state._tag,
      nextState,
      ...(active?.requestId ? { requestId: active.requestId } : {}),
      ...(input.evidence ? { evidence: input.evidence } : {}),
    }),
  }
}

export function createForegroundSessionEvent<T extends ForegroundSessionEvent>(
  event: T,
): T {
  return event
}

export function activeSessionFromState(
  state: ForegroundSessionState,
): ForegroundSessionActiveSession | undefined {
  switch (state._tag) {
    case "IdleReady":
      return undefined
    case "Preparing":
    case "Spawning":
    case "Foregrounding":
    case "Running":
    case "ExitObserved":
    case "TearingDown":
    case "VerifyingReady":
      return state.active
    case "Failed":
    case "Recovering":
      return state.active
  }
}

function stateForTag(
  tag: Exclude<ForegroundSessionStateTag, "IdleReady">,
  active: ForegroundSessionActiveSession | undefined,
  failure: ForegroundSessionFailure | undefined,
): ForegroundSessionState {
  switch (tag) {
    case "Preparing":
      return foregroundSessionState.preparing({ active: requireActive(tag, active) })
    case "Spawning":
      return foregroundSessionState.spawning({ active: requireActive(tag, active) })
    case "Foregrounding":
      return foregroundSessionState.foregrounding({ active: requireActive(tag, active) })
    case "Running":
      return foregroundSessionState.running({ active: requireActive(tag, active) })
    case "ExitObserved":
      return foregroundSessionState.exitObserved({ active: requireActive(tag, active) })
    case "TearingDown":
      return foregroundSessionState.tearingDown({ active: requireActive(tag, active) })
    case "VerifyingReady":
      return foregroundSessionState.verifyingReady({ active: requireActive(tag, active) })
    case "Failed":
      return foregroundSessionState.failed({
        active,
        failure: failure ?? { stage: "adapter", message: "session failed" },
      })
    case "Recovering":
      return foregroundSessionState.recovering({
        active,
        failure: failure ?? { stage: "cleanup", message: "session recovering" },
      })
  }
}

function requireActive(
  tag: ForegroundSessionStateTag,
  active: ForegroundSessionActiveSession | undefined,
): ForegroundSessionActiveSession {
  if (active) return active
  throw new Error(`${tag} requires an active foreground session`)
}
