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

/**
 * Stage at which a foreground-session attempt failed. The vocabulary
 * here is shared by every layer that can report a failure on the
 * lifecycle (owner stages, adapter outcomes, sessiond mapping). Names
 * align with the steps the owner walks the FSM through:
 *
 * - `prepare`    — pre-spawn host preparation (`prepareForeground` adapter).
 * - `spawn`      — launching the child process.
 * - `foreground` — making the child foreground (surface repair).
 * - `exit`       — child exited with a non-zero or unexpected status.
 * - `teardown`   — post-exit cleanup (`teardownForeground` adapter).
 *                  Renamed from `cleanup` to align with the
 *                  `ForegroundSessionAdapterOutcome` event vocabulary
 *                  the owner already emits ("teardown" / "verifyReady").
 * - `readiness`  — the post-cleanup ready check (`verifyReady` adapter).
 * - `restore`    — a Recovering state's restore step failed. Distinct
 *                  from `teardown`: teardown is the happy-path exit
 *                  cleanup, restore is the failure-path attempt to get
 *                  back to IdleReady.
 * - `adapter`    — a non-stage-specific adapter / external integration
 *                  failure.
 *
 * Was `"accept"` here previously; that stage was never used in any
 * `ForegroundSessionFailure` (acceptance failures surface as
 * `ForegroundSessionBusyRejection`, not a failure object).
 */
export type ForegroundSessionFailureStage =
  | "prepare"
  | "spawn"
  | "foreground"
  | "exit"
  | "teardown"
  | "readiness"
  | "restore"
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
  | {
      readonly _tag: "Preparing"
      readonly active: ForegroundSessionActiveSession
    }
  | {
      readonly _tag: "Spawning"
      readonly active: ForegroundSessionActiveSession
    }
  | {
      readonly _tag: "Foregrounding"
      readonly active: ForegroundSessionActiveSession
    }
  | {
      readonly _tag: "Running"
      readonly active: ForegroundSessionActiveSession
    }
  | {
      readonly _tag: "ExitObserved"
      readonly active: ForegroundSessionActiveSession
    }
  | {
      readonly _tag: "TearingDown"
      readonly active: ForegroundSessionActiveSession
    }
  | {
      readonly _tag: "VerifyingReady"
      readonly active: ForegroundSessionActiveSession
    }
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

/**
 * Source of a foreground-session busy rejection.
 *
 * - `owner-local`: the in-process `ForegroundSessionOwner`'s own state machine
 *   was non-idle when the launch was attempted (re-entry by a concurrent app
 *   caller).
 * - `sessiond`: the owner's `consultExternalIdle` preflight observed sessiond
 *   in a non-idle mode (out-of-band caller, or a lingering session sessiond
 *   has not yet finished restoring).
 *
 * Optional for back-compat: callers that don't distinguish should treat an
 * absent value as `owner-local`.
 */
type ForegroundSessionBusyRejectionSource = "owner-local" | "sessiond"

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
  readonly source?: ForegroundSessionBusyRejectionSource
  /**
   * When `source === "sessiond"`, the sessiond mode that triggered the
   * rejection (e.g. `"game"`, `"restoring"`). Absent for owner-local.
   */
  readonly externalMode?: string
}

export type ForegroundSessionAcceptResult =
  | {
      readonly _tag: "Accepted"
      readonly state: Extract<
        ForegroundSessionState,
        { readonly _tag: "Preparing" }
      >
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
  }): ForegroundSessionState => ({
    _tag: "Foregrounding",
    active: input.active,
  }),
  running: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "Running", active: input.active }),
  exitObserved: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({
    _tag: "ExitObserved",
    active: input.active,
  }),
  tearingDown: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({ _tag: "TearingDown", active: input.active }),
  verifyingReady: (input: {
    readonly active: ForegroundSessionActiveSession
  }): ForegroundSessionState => ({
    _tag: "VerifyingReady",
    active: input.active,
  }),
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
  // SEC-001 (task-017): the rejection message must NOT embed the owner
  // FSM tag, because the adapter forwards `rejection.message` verbatim
  // as the wire-response `stderrTail`. Leaking the tag here is the same
  // information disclosure as shipping `preflightReason.currentState`
  // — just via a different field. Keep the wire string generic; the
  // internal `currentState` field preserves the tag for logging.
  const active = activeSessionFromState(state)
  return {
    category: "session-busy",
    message: "Foreground session is busy",
    attemptedRequestId: request.requestId,
    attemptedGameId: request.gameId,
    currentState: state._tag,
    ...(active?.requestId ? { currentRequestId: active.requestId } : {}),
    ...(active?.gameId ? { currentGameId: active.gameId } : {}),
    ...(active?.sessionId ? { currentSessionId: active.sessionId } : {}),
    ...(active?.child?.id ? { currentChildId: active.child.id } : {}),
  }
}

/**
 * Permissive (state, nextTag) constructor. Accepts any pair and produces
 * the next state — it does NOT enforce edge legality. Legal ordering is
 * the responsibility of `createForegroundSessionOwner`'s control flow,
 * which is the only sanctioned caller. Tests that want illegal-edge
 * coverage exercise the owner; this helper is intentionally
 * unrestricted so the owner can compose transitions cleanly.
 *
 * See `foreground-session-lifecycle.test.ts` ("rejects every non-idle
 * state with a busy/not-ready result" — walks `NON_IDLE_STATES`
 * exhaustively) for the canonical proof that the owner-level ordering
 * is enforced for every non-IdleReady state tag.
 */
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
      return foregroundSessionState.preparing({
        active: requireActive(tag, active),
      })
    case "Spawning":
      return foregroundSessionState.spawning({
        active: requireActive(tag, active),
      })
    case "Foregrounding":
      return foregroundSessionState.foregrounding({
        active: requireActive(tag, active),
      })
    case "Running":
      return foregroundSessionState.running({
        active: requireActive(tag, active),
      })
    case "ExitObserved":
      return foregroundSessionState.exitObserved({
        active: requireActive(tag, active),
      })
    case "TearingDown":
      return foregroundSessionState.tearingDown({
        active: requireActive(tag, active),
      })
    case "VerifyingReady":
      return foregroundSessionState.verifyingReady({
        active: requireActive(tag, active),
      })
    case "Failed":
      return foregroundSessionState.failed({
        active,
        failure: failure ?? { stage: "adapter", message: "session failed" },
      })
    case "Recovering":
      return foregroundSessionState.recovering({
        active,
        // A Recovering state is by definition a restore in progress;
        // default to `restore` (not `teardown`) so a caller that forgets
        // to provide an explicit failure still produces a semantically
        // accurate stage tag.
        failure: failure ?? { stage: "restore", message: "session recovering" },
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
