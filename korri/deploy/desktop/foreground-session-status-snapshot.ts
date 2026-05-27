import type {
  ForegroundSessionActiveSession,
  ForegroundSessionEvent,
  ForegroundSessionFailure,
  ForegroundSessionState,
  ForegroundSessionTerminalStatus,
} from "@shared/stream/foreground-session-lifecycle"
import type {
  ForegroundSessionStatusActive,
  ForegroundSessionStatusEvent,
  ForegroundSessionStatusFailure,
  ForegroundSessionStatusReadiness,
  ForegroundSessionStatusSnapshot,
  ForegroundSessionStatusTerminal,
  ForegroundSessionStatusTerminalSummary,
} from "@shared/stream/foreground-session-status"
import type { ForegroundSessionOwnerStatus } from "./foreground-session-owner"

export interface ForegroundSessionStatusSnapshotOptions {
  readonly status: ForegroundSessionOwnerStatus
  readonly now?: Date
  readonly recentEventLimit?: number
}

export function foregroundSessionStatusSnapshotFromOwnerStatus({
  status,
  now = new Date(),
  recentEventLimit = 32,
}: ForegroundSessionStatusSnapshotOptions): ForegroundSessionStatusSnapshot {
  const requestGameIds = requestGameIdsFromEvents(status.events)
  const active = activeFromState(status.state)
  const lastTerminal = lastTerminalFromEvents(status.events, requestGameIds)
  const lastReadiness = lastReadinessFromEvents(
    status.events,
    requestGameIds,
    active?.requestId,
  )
  const lastFailure =
    failureFromState(status.state) ??
    failureFromEvents(status.events, requestGameIds)
  const recentEvents = status.events
    .slice(-recentEventLimit)
    .map(event => eventSummary(event, requestGameIds))

  return {
    schemaVersion: 1,
    serverTimestamp: now.toISOString(),
    state: status.state._tag,
    ...(active ? { active } : {}),
    ...(lastTerminal ? { lastTerminal } : {}),
    ...(lastFailure ? { lastFailure } : {}),
    ...(lastReadiness ? { lastReadiness } : {}),
    recentEvents,
  }
}

function requestGameIdsFromEvents(
  events: readonly ForegroundSessionEvent[],
): ReadonlyMap<string, string> {
  const ids = new Map<string, string>()
  for (const event of events) {
    switch (event._tag) {
      case "ForegroundSessionLaunchAccepted":
        ids.set(event.requestId, event.gameId)
        break
      case "ForegroundSessionLaunchRejected":
        ids.set(event.requestId, event.gameId)
        ids.set(
          event.rejection.attemptedRequestId,
          event.rejection.attemptedGameId,
        )
        if (event.rejection.currentRequestId && event.rejection.currentGameId) {
          ids.set(
            event.rejection.currentRequestId,
            event.rejection.currentGameId,
          )
        }
        break
      default:
        break
    }
  }
  return ids
}

function activeFromState(
  state: ForegroundSessionState,
): ForegroundSessionStatusActive | undefined {
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
      return activeSummary(state.active)
    case "Failed":
    case "Recovering":
      return state.active ? activeSummary(state.active) : undefined
  }
}

function activeSummary(
  active: ForegroundSessionActiveSession,
): ForegroundSessionStatusActive {
  return {
    requestId: active.requestId,
    gameId: active.gameId,
    ...(active.hostId ? { hostId: active.hostId } : {}),
    ...(active.sessionId ? { sessionId: active.sessionId } : {}),
    ...(active.child
      ? {
          child: {
            id: active.child.id,
            ...(active.child.processId === undefined
              ? {}
              : { processId: active.child.processId }),
          },
        }
      : {}),
  }
}

function terminalSummary(
  terminal: ForegroundSessionTerminalStatus,
): ForegroundSessionStatusTerminal {
  switch (terminal._tag) {
    case "Exited":
      return { tag: "Exited", exitCode: terminal.exitCode }
    case "Signaled":
      return { tag: "Signaled", signal: terminal.signal }
    case "Terminated":
      return { tag: "Terminated" }
    case "Failed":
      return { tag: "Failed", message: terminal.message }
  }
}

function lastTerminalFromEvents(
  events: readonly ForegroundSessionEvent[],
  requestGameIds: ReadonlyMap<string, string>,
): ForegroundSessionStatusTerminalSummary | undefined {
  for (const event of [...events].reverse()) {
    if (event._tag !== "ForegroundSessionExited") continue
    return {
      requestId: event.requestId,
      ...(requestGameIds.get(event.requestId)
        ? { gameId: requestGameIds.get(event.requestId) }
        : {}),
      terminal: terminalSummary(event.terminal),
    }
  }
  return undefined
}

function failureFromState(
  state: ForegroundSessionState,
): ForegroundSessionStatusFailure | undefined {
  switch (state._tag) {
    case "Failed":
    case "Recovering":
      return failureSummary(state.failure, state.active)
    default:
      return undefined
  }
}

function failureFromEvents(
  events: readonly ForegroundSessionEvent[],
  requestGameIds: ReadonlyMap<string, string>,
): ForegroundSessionStatusFailure | undefined {
  for (const event of [...events].reverse()) {
    if (
      event._tag === "ForegroundSessionAdapterOutcome" &&
      event.status === "failed"
    ) {
      return {
        requestId: event.requestId,
        ...(requestGameIds.get(event.requestId)
          ? { gameId: requestGameIds.get(event.requestId) }
          : {}),
        stage: event.stage,
        message:
          stringFromEvidence(event.evidence?.message) ??
          responseMessageFromEvidence(event.evidence?.response) ??
          "session failed",
      }
    }

    if (
      event._tag !== "ForegroundSessionStateChanged" ||
      event.nextState !== "Failed"
    )
      continue
    return {
      ...(event.requestId ? { requestId: event.requestId } : {}),
      ...(event.requestId && requestGameIds.get(event.requestId)
        ? { gameId: requestGameIds.get(event.requestId) }
        : {}),
      stage: stringFromEvidence(event.evidence?.stage) ?? "adapter",
      message: stringFromEvidence(event.evidence?.message) ?? "session failed",
    }
  }
  return undefined
}

function failureSummary(
  failure: ForegroundSessionFailure,
  active: ForegroundSessionActiveSession | undefined,
): ForegroundSessionStatusFailure {
  return {
    ...(active?.requestId ? { requestId: active.requestId } : {}),
    ...(active?.gameId ? { gameId: active.gameId } : {}),
    stage: failure.stage,
    message: failure.message,
  }
}

function lastReadinessFromEvents(
  events: readonly ForegroundSessionEvent[],
  requestGameIds: ReadonlyMap<string, string>,
  activeRequestId: string | undefined,
): ForegroundSessionStatusReadiness | undefined {
  for (const event of [...events].reverse()) {
    if (
      event._tag !== "ForegroundSessionAdapterOutcome" ||
      event.stage !== "verifyReady"
    )
      continue
    if (activeRequestId && event.requestId !== activeRequestId) return undefined
    return {
      requestId: event.requestId,
      ...(requestGameIds.get(event.requestId)
        ? { gameId: requestGameIds.get(event.requestId) }
        : {}),
      status: event.status === "failed" ? "failed" : "ok",
      stage: event.stage,
      ...(stringFromEvidence(event.evidence?.gate)
        ? { gate: stringFromEvidence(event.evidence?.gate) }
        : {}),
      ...(stringFromEvidence(event.evidence?.message)
        ? { message: stringFromEvidence(event.evidence?.message) }
        : {}),
    }
  }
  return undefined
}

function eventSummary(
  event: ForegroundSessionEvent,
  requestGameIds: ReadonlyMap<string, string>,
): ForegroundSessionStatusEvent {
  switch (event._tag) {
    case "ForegroundSessionLaunchAccepted":
      return {
        tag: event._tag,
        requestId: event.requestId,
        gameId: event.gameId,
      }
    case "ForegroundSessionLaunchRejected":
      return {
        tag: event._tag,
        requestId: event.requestId,
        gameId: event.gameId,
        category: event.rejection.category,
        state: event.rejection.currentState,
        message: event.rejection.message,
      }
    case "ForegroundSessionStateChanged":
      return {
        tag: event._tag,
        ...(event.requestId ? { requestId: event.requestId } : {}),
        ...(event.requestId && requestGameIds.get(event.requestId)
          ? { gameId: requestGameIds.get(event.requestId) }
          : {}),
        previousState: event.previousState,
        nextState: event.nextState,
      }
    case "ForegroundSessionAdapterOutcome":
      return {
        tag: event._tag,
        requestId: event.requestId,
        ...(requestGameIds.get(event.requestId)
          ? { gameId: requestGameIds.get(event.requestId) }
          : {}),
        stage: event.stage,
        status: event.status,
        ...(stringFromEvidence(event.evidence?.gate)
          ? { gate: stringFromEvidence(event.evidence?.gate) }
          : {}),
        ...(stringFromEvidence(event.evidence?.message)
          ? { message: stringFromEvidence(event.evidence?.message) }
          : {}),
      }
    case "ForegroundSessionForegroundWarning":
      return {
        tag: event._tag,
        requestId: event.requestId,
        ...(requestGameIds.get(event.requestId)
          ? { gameId: requestGameIds.get(event.requestId) }
          : {}),
        status: "warning",
        message: event.message,
      }
    case "ForegroundSessionExited":
      return {
        tag: event._tag,
        requestId: event.requestId,
        ...(requestGameIds.get(event.requestId)
          ? { gameId: requestGameIds.get(event.requestId) }
          : {}),
        terminal: terminalSummary(event.terminal),
      }
    case "ForegroundSessionReady":
      return {
        tag: event._tag,
        ...(event.previousRequestId
          ? { requestId: event.previousRequestId }
          : {}),
      }
  }
}

function stringFromEvidence(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function responseMessageFromEvidence(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return stringFromEvidence(value.message)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
