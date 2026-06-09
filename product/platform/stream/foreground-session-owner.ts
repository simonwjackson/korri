// ARCHITECTURE NOTE
//
// `ForegroundSessionOwner` is an adapter pipeline orchestrator with preflight
// re-entry protection: it owns `prepare → spawn → foreground → teardown →
// verifyReady` for a single launch, with abort control, event history, and
// active-handle tracking. It is NOT the authoritative source of physical-host
// foreground lifecycle truth.
//
// On Korri hosts where `sessiond` is configured, sessiond is the authoritative
// lifecycle source (`stopped/starting/home|idle/launching/game/restoring/
// recovering`). The owner's preflight consults sessiond via the optional
// `consultExternalIdle` hook so out-of-band callers cannot leave the owner
// believing the host is idle while sessiond is busy.
//
// See: docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md
import {
  acceptForegroundSessionLaunch,
  activeSessionFromState,
  createForegroundSessionEvent,
  type ForegroundSessionActiveSession,
  type ForegroundSessionBusyRejection,
  type ForegroundSessionEvent,
  type ForegroundSessionEvidence,
  type ForegroundSessionRequestIdentity,
  type ForegroundSessionState,
  foregroundSessionState,
  foregroundSessionTransition,
} from "@platform/stream/foreground-session-lifecycle"

export type { ForegroundSessionEvidence } from "@platform/stream/foreground-session-lifecycle"

/**
 * Result of an external idle-authority check (typically sessiond).
 *
 * Three-valued so the owner can map sessiond's three observable states to
 * distinct rejection paths:
 *
 * - `idle`         → preflight accepts; launch proceeds to the owner-local check.
 * - `not-idle`     → preflight rejects as `Busy` with `source: "sessiond"`.
 * - `unavailable`  → preflight rejects as `ExternalUnavailable` (network error
 *                    or request rejected). No spawn attempted; fail-closed posture
 *                    matches the existing `session-launcher.ts` 401 →
 *                    `host-control-disabled` mapping.
 */
export type ForegroundExternalIdleResult =
  | { readonly status: "idle" }
  | { readonly status: "not-idle"; readonly mode: string }
  | {
      readonly status: "unavailable"
      readonly reason: "network" | "request-rejected"
      readonly message?: string
    }

export type ForegroundManagedSessionReadiness =
  | {
      readonly status: "ok"
      readonly evidence?: ForegroundSessionEvidence
    }
  | {
      readonly status: "failed"
      readonly message: string
      readonly evidence?: ForegroundSessionEvidence
    }

export interface ForegroundManagedSessionHandle {
  readonly id: string
  readonly processId?: number
  /**
   * POSIX process group id of the managed launch when the launcher
   * wraps the spawn in a new session (e.g., `setsid -- <command>`).
   * Sessiond's gamescope reaper uses this as the launch's scope boundary.
   */
  readonly processGroupId?: number
  readonly exited: Promise<{ readonly exitCode: number | null }>
  readonly ready?: Promise<ForegroundManagedSessionReadiness>
  readonly isGone?: () => Promise<boolean> | boolean
  readonly terminate: () => void
  readonly terminateNow: () => void
}

export type ForegroundSessionStageResult<T, TFailure = never> =
  | {
      readonly status: "ok"
      readonly value: T
      readonly evidence?: Readonly<Record<string, unknown>>
    }
  | {
      readonly status: "failed"
      readonly message: string
      readonly evidence?: Readonly<Record<string, unknown>>
      readonly failure?: TFailure
    }

export type ForegroundSessionForegroundResult =
  | {
      readonly status: "ok"
      readonly evidence?: Readonly<Record<string, unknown>>
    }
  | {
      readonly status: "warning"
      readonly message: string
      readonly evidence?: Readonly<Record<string, unknown>>
    }
  | {
      readonly status: "failed"
      readonly message: string
      readonly evidence?: Readonly<Record<string, unknown>>
    }

export interface ForegroundSessionSpawned {
  readonly session: ForegroundManagedSessionHandle
}

export interface ForegroundSessionReadinessInput<
  TRequest,
  TPrepared,
  TSpawned extends ForegroundSessionSpawned,
> {
  readonly request: TRequest
  readonly prepared: TPrepared
  readonly spawned: TSpawned
  readonly active: ForegroundSessionActiveSession
  readonly signal: AbortSignal
}

export interface ForegroundSessionAdapter<
  TRequest,
  TPrepared,
  TSpawned extends ForegroundSessionSpawned,
  TSuccess,
  TFailure = never,
> {
  prepare: (
    request: TRequest,
  ) => Promise<ForegroundSessionStageResult<TPrepared, TFailure>>
  spawn: (
    prepared: TPrepared,
  ) => Promise<ForegroundSessionStageResult<TSpawned, TFailure>>
  foreground?: (spawned: TSpawned) => Promise<ForegroundSessionForegroundResult>
  teardown?: (
    input: ForegroundSessionReadinessInput<TRequest, TPrepared, TSpawned>,
  ) => Promise<ForegroundSessionStageResult<ForegroundSessionEvidence>>
  verifyReady?: (
    input: ForegroundSessionReadinessInput<TRequest, TPrepared, TSpawned>,
  ) => Promise<ForegroundSessionStageResult<ForegroundSessionEvidence>>
  launched: (input: {
    readonly request: TRequest
    readonly prepared: TPrepared
    readonly spawned: TSpawned
    readonly foreground?: ForegroundSessionForegroundResult
  }) => TSuccess
}

export interface ForegroundSessionOwnerOptions<
  TRequest,
  TPrepared,
  TSpawned extends ForegroundSessionSpawned,
  TSuccess,
  TFailure = never,
> {
  readonly requestIdentity: (
    request: TRequest,
  ) => ForegroundSessionRequestIdentity
  readonly adapter: ForegroundSessionAdapter<
    TRequest,
    TPrepared,
    TSpawned,
    TSuccess,
    TFailure
  >
  readonly eventHistoryLimit?: number
  readonly onStateEntered?: (
    state: ForegroundSessionState,
  ) => Promise<void> | void
  /**
   * Optional preflight hook that consults an external idle authority
   * (sessiond on Korri hosts). When set, the owner queries it BEFORE the
   * owner-local re-entry check, so an out-of-band `/managed-launch` POST
   * cannot leave the owner believing the host is idle.
   *
   * When unset (live-USB, no sessiond configured), the owner falls back to
   * the owner-local check only — behavior is unchanged from the pre-hook
   * shape.
   *
   * See: docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md
   */
  readonly consultExternalIdle?: () => Promise<ForegroundExternalIdleResult>
}

export type ForegroundSessionOwnerLaunchResult<TSuccess, TFailure = never> =
  | { readonly _tag: "Launched"; readonly value: TSuccess }
  | {
      readonly _tag: "Busy"
      readonly rejection: ForegroundSessionBusyRejection
    }
  | {
      readonly _tag: "ExternalUnavailable"
      readonly reason: "network" | "request-rejected"
      readonly message: string
    }
  | {
      readonly _tag: "Failed"
      readonly message: string
      readonly evidence?: Readonly<Record<string, unknown>>
      readonly failure?: TFailure
    }

export interface ForegroundSessionOwnerStatus {
  readonly state: ForegroundSessionState
  readonly events: readonly ForegroundSessionEvent[]
}

export function createForegroundSessionOwner<
  TRequest,
  TPrepared,
  TSpawned extends ForegroundSessionSpawned,
  TSuccess,
  TFailure = never,
>(
  options: ForegroundSessionOwnerOptions<
    TRequest,
    TPrepared,
    TSpawned,
    TSuccess,
    TFailure
  >,
) {
  let state = foregroundSessionState.idleReady()
  let activeHandle: ForegroundManagedSessionHandle | undefined
  let activeAbortController: AbortController | undefined
  const events: ForegroundSessionEvent[] = []
  const idleWaiters = new Set<() => void>()
  const eventHistoryLimit = options.eventHistoryLimit ?? 128

  const pushEvent = (event: ForegroundSessionEvent) => {
    events.push(event)
    if (events.length > eventHistoryLimit)
      events.splice(0, events.length - eventHistoryLimit)
  }

  const notifyIdle = () => {
    if (state._tag !== "IdleReady") return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }

  const setState = (next: ForegroundSessionState): Promise<void> | void => {
    state = next
    const entered = options.onStateEntered?.(state)
    notifyIdle()
    return entered
  }

  const transition = async (
    nextState: Exclude<ForegroundSessionState["_tag"], "IdleReady">,
    input: {
      readonly active?: ForegroundSessionActiveSession
      readonly evidence?: Readonly<Record<string, unknown>>
      readonly failure?: {
        readonly stage: "adapter" | "teardown" | "readiness" | "restore"
        readonly message: string
        readonly evidence?: Readonly<Record<string, unknown>>
      }
    } = {},
  ) => {
    const result = foregroundSessionTransition(state, nextState, input)
    pushEvent(result.event)
    const entered = setState(result.state)
    if (entered) await entered
  }

  const terminateActiveHandle = async () => {
    const handle = activeHandle
    if (!handle) return
    handle.terminate()
    await Promise.race([
      handle.exited.catch(() => undefined),
      new Promise<undefined>(resolve => setTimeout(resolve, 1_000)),
    ])
    if (activeHandle === handle) activeHandle = undefined
  }

  const releaseToIdle = async (
    previousRequestId?: string,
    evidence?: ForegroundSessionEvidence,
    options: { readonly emitReady?: boolean } = {},
  ) => {
    if (options.emitReady !== false) {
      pushEvent(
        createForegroundSessionEvent({
          _tag: "ForegroundSessionReady",
          ...(previousRequestId ? { previousRequestId } : {}),
          ...(evidence ? { evidence } : {}),
        }),
      )
    }
    activeHandle = undefined
    activeAbortController = undefined
    const entered = setState(foregroundSessionState.idleReady())
    if (entered) await entered
  }

  const failAndRelease = async (
    active: ForegroundSessionActiveSession | undefined,
    message: string,
    evidence?: Readonly<Record<string, unknown>>,
    stage: "adapter" | "teardown" | "readiness" | "restore" = "adapter",
    failure?: TFailure,
  ): Promise<ForegroundSessionOwnerLaunchResult<TSuccess, TFailure>> => {
    await terminateActiveHandle()
    await transition("Failed", {
      active,
      evidence,
      failure: { stage, message, evidence },
    })
    await transition("Recovering", {
      active,
      evidence,
      failure: { stage, message, evidence },
    })
    await releaseToIdle(active?.requestId)
    return {
      _tag: "Failed",
      message,
      ...(evidence ? { evidence } : {}),
      ...(failure !== undefined ? { failure } : {}),
    }
  }

  const observeExit = (
    input: ForegroundSessionReadinessInput<TRequest, TPrepared, TSpawned>,
  ) => {
    const handle = input.spawned.session
    void handle.exited.then(
      async terminal => {
        const current = activeSessionFromState(state)
        if (
          current?.requestId !== input.active.requestId ||
          activeHandle !== handle
        )
          return
        const terminalActive = {
          ...input.active,
          terminal: { _tag: "Exited" as const, exitCode: terminal.exitCode },
        }
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionExited",
            requestId: input.active.requestId,
            terminal: terminalActive.terminal,
          }),
        )
        await transition("ExitObserved", { active: terminalActive })
        await transition("TearingDown", { active: terminalActive })
        let teardown: ForegroundSessionStageResult<ForegroundSessionEvidence>
        try {
          teardown = options.adapter.teardown
            ? await options.adapter.teardown({
                ...input,
                active: terminalActive,
              })
            : ({
                status: "ok",
                value: {},
              } satisfies ForegroundSessionStageResult<ForegroundSessionEvidence>)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await failAndRelease(
            terminalActive,
            message,
            { stage: "teardown", message },
            "teardown",
          )
          return
        }
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: input.active.requestId,
            stage: "teardown",
            status: teardown.status === "ok" ? "ok" : "failed",
            ...(teardown.status === "ok" && teardown.value
              ? { evidence: teardown.value }
              : {}),
            ...(teardown.status === "failed" && teardown.evidence
              ? { evidence: teardown.evidence }
              : {}),
          }),
        )
        if (teardown.status === "failed") {
          await failAndRelease(
            terminalActive,
            teardown.message,
            teardown.evidence,
            "teardown",
          )
          return
        }
        if (input.signal.aborted) {
          await releaseToIdle(input.active.requestId, teardown.value, {
            emitReady: false,
          })
          return
        }

        await transition("VerifyingReady", {
          active: terminalActive,
          evidence: teardown.value,
        })
        let ready: ForegroundSessionStageResult<ForegroundSessionEvidence>
        try {
          ready = options.adapter.verifyReady
            ? await options.adapter.verifyReady({
                ...input,
                active: terminalActive,
              })
            : ({
                status: "ok",
                value: {},
              } satisfies ForegroundSessionStageResult<ForegroundSessionEvidence>)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await failAndRelease(
            terminalActive,
            message,
            { stage: "readiness", message },
            "readiness",
          )
          return
        }
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: input.active.requestId,
            stage: "verifyReady",
            status: ready.status === "ok" ? "ok" : "failed",
            ...(ready.status === "ok" && ready.value
              ? { evidence: ready.value }
              : {}),
            ...(ready.status === "failed" && ready.evidence
              ? { evidence: ready.evidence }
              : {}),
          }),
        )
        if (ready.status === "failed") {
          await failAndRelease(
            terminalActive,
            ready.message,
            ready.evidence,
            "readiness",
          )
          return
        }
        await releaseToIdle(input.active.requestId, ready.value, {
          emitReady: !input.signal.aborted,
        })
      },
      async error => {
        const current = activeSessionFromState(state)
        if (
          current?.requestId !== input.active.requestId ||
          activeHandle !== handle
        )
          return
        const message = error instanceof Error ? error.message : String(error)
        await failAndRelease(input.active, message)
      },
    )
  }

  return {
    launch: async (
      request: TRequest,
    ): Promise<ForegroundSessionOwnerLaunchResult<TSuccess, TFailure>> => {
      const identity = options.requestIdentity(request)

      // External preflight: consult sessiond (or other configured idle
      // authority) BEFORE the owner-local re-entry check. Catches out-of-band
      // callers that may have transitioned sessiond away from idle without
      // the owner observing it. Not atomic across concurrent in-process
      // launches — the owner-local check below is still the mutex.
      if (options.consultExternalIdle) {
        const external = await options.consultExternalIdle()
        if (external.status === "not-idle") {
          const rejection: ForegroundSessionBusyRejection = {
            category: "session-busy",
            message: `external authority (sessiond) is ${external.mode}; launch requires idle`,
            attemptedRequestId: identity.requestId,
            attemptedGameId: identity.gameId,
            currentState: state._tag,
            source: "sessiond",
            externalMode: external.mode,
          }
          pushEvent(
            createForegroundSessionEvent({
              _tag: "ForegroundSessionLaunchRejected",
              requestId: identity.requestId,
              gameId: identity.gameId,
              rejection,
            }),
          )
          return { _tag: "Busy", rejection }
        }
        if (external.status === "unavailable") {
          const message =
            external.message ??
            (external.reason === "request-rejected"
              ? "sessiond rejected the request"
              : "sessiond is unreachable")
          return {
            _tag: "ExternalUnavailable",
            reason: external.reason,
            message,
          }
        }
        // status === "idle" → fall through to the owner-local check.
      }

      const accepted = acceptForegroundSessionLaunch(state, identity)
      if (accepted._tag === "Rejected") {
        const rejection: ForegroundSessionBusyRejection = {
          ...accepted.rejection,
          source: "owner-local",
        }
        // Re-emit the rejected event with the enriched rejection so the
        // event stream and the launch result agree on `source`.
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionLaunchRejected",
            requestId: identity.requestId,
            gameId: identity.gameId,
            rejection,
          }),
        )
        return { _tag: "Busy", rejection }
      }

      pushEvent(accepted.event)
      activeAbortController = new AbortController()
      const entered = setState(accepted.state)
      if (entered) await entered
      let active = accepted.active

      try {
        const prepared = await options.adapter.prepare(request)
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: active.requestId,
            stage: "prepare",
            status: prepared.status === "ok" ? "ok" : "failed",
            ...(prepared.evidence ? { evidence: prepared.evidence } : {}),
          }),
        )
        if (prepared.status === "failed") {
          return await failAndRelease(
            active,
            prepared.message,
            prepared.evidence,
            "adapter",
            prepared.failure,
          )
        }

        await transition("Spawning", { active, evidence: prepared.evidence })
        const spawned = await options.adapter.spawn(prepared.value)
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionAdapterOutcome",
            requestId: active.requestId,
            stage: "spawn",
            status: spawned.status === "ok" ? "ok" : "failed",
            ...(spawned.evidence ? { evidence: spawned.evidence } : {}),
          }),
        )
        if (spawned.status === "failed") {
          return await failAndRelease(
            active,
            spawned.message,
            spawned.evidence,
            "adapter",
            spawned.failure,
          )
        }

        // task-013: thread the launcher's session identifier onto both
        // `child.id` (process-local handle id) and `sessionId`
        // (cross-component correlation id). For sessiond-backed
        // launchers `session.id === started.launchId`, which is the
        // identifier sessiond's managed-launch events and termination
        // protocol use. Populating `sessionId` here means a subsequent
        // busy rejection's `currentSessionId` carries the same value
        // operators see in sessiond logs — the gap from task-013 AC #1.
        activeHandle = spawned.value.session
        active = {
          ...active,
          sessionId: spawned.value.session.id,
          child: {
            id: spawned.value.session.id,
            ...(spawned.value.session.processId === undefined
              ? {}
              : { processId: spawned.value.session.processId }),
          },
        }
        await transition("Foregrounding", {
          active,
          evidence: spawned.evidence,
        })

        const foreground = options.adapter.foreground
          ? await options.adapter.foreground(spawned.value)
          : ({ status: "ok" } satisfies ForegroundSessionForegroundResult)
        if (foreground.status === "failed") {
          pushEvent(
            createForegroundSessionEvent({
              _tag: "ForegroundSessionAdapterOutcome",
              requestId: active.requestId,
              stage: "foreground",
              status: "failed",
              ...(foreground.evidence ? { evidence: foreground.evidence } : {}),
            }),
          )
          return await failAndRelease(
            active,
            foreground.message,
            foreground.evidence,
          )
        }
        if (foreground.status === "warning") {
          pushEvent(
            createForegroundSessionEvent({
              _tag: "ForegroundSessionForegroundWarning",
              requestId: active.requestId,
              message: foreground.message,
              ...(foreground.evidence ? { evidence: foreground.evidence } : {}),
            }),
          )
        }
        if (foreground.evidence) {
          active = {
            ...active,
            foregroundEvidence: [
              ...(active.foregroundEvidence ?? []),
              foreground.evidence,
            ],
          }
        }

        await transition("Running", { active, evidence: foreground.evidence })
        observeExit({
          request,
          prepared: prepared.value,
          spawned: spawned.value,
          active,
          signal: activeAbortController.signal,
        })
        return {
          _tag: "Launched",
          value: options.adapter.launched({
            request,
            prepared: prepared.value,
            spawned: spawned.value,
            foreground,
          }),
        }
      } catch (error) {
        return await failAndRelease(
          active,
          error instanceof Error ? error.message : String(error),
        )
      }
    },

    status: (): ForegroundSessionOwnerStatus => ({
      state,
      events: [...events],
    }),

    whenIdle: async (): Promise<void> => {
      if (state._tag === "IdleReady") return
      await new Promise<void>(resolve => idleWaiters.add(resolve))
    },

    terminateActiveSession: async (): Promise<void> => {
      activeAbortController?.abort()
      const handle = activeHandle
      if (!handle) return
      handle.terminate()
      await handle.exited.catch(() => undefined)
    },

    terminateActiveSessionNow: (): void => {
      activeAbortController?.abort()
      activeHandle?.terminateNow()
    },
  }
}
