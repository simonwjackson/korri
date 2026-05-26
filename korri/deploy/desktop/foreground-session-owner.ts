import {
  acceptForegroundSessionLaunch,
  activeSessionFromState,
  createForegroundSessionEvent,
  type ForegroundSessionActiveSession,
  type ForegroundSessionBusyRejection,
  type ForegroundSessionEvent,
  type ForegroundSessionRequestIdentity,
  type ForegroundSessionState,
  foregroundSessionState,
  foregroundSessionTransition,
} from "@shared/stream/foreground-session-lifecycle"

export interface ForegroundManagedSessionHandle {
  readonly id: string
  readonly processId?: number
  readonly exited: Promise<{ readonly exitCode: number | null }>
  readonly terminate: () => void
  readonly terminateNow: () => void
}

export type ForegroundSessionStageResult<T> =
  | {
      readonly status: "ok"
      readonly value: T
      readonly evidence?: Readonly<Record<string, unknown>>
    }
  | {
      readonly status: "failed"
      readonly message: string
      readonly evidence?: Readonly<Record<string, unknown>>
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

export interface ForegroundSessionAdapter<
  TRequest,
  TPrepared,
  TSpawned extends ForegroundSessionSpawned,
  TSuccess,
> {
  prepare: (
    request: TRequest,
  ) => Promise<ForegroundSessionStageResult<TPrepared>>
  spawn: (
    prepared: TPrepared,
  ) => Promise<ForegroundSessionStageResult<TSpawned>>
  foreground?: (spawned: TSpawned) => Promise<ForegroundSessionForegroundResult>
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
> {
  readonly requestIdentity: (
    request: TRequest,
  ) => ForegroundSessionRequestIdentity
  readonly adapter: ForegroundSessionAdapter<
    TRequest,
    TPrepared,
    TSpawned,
    TSuccess
  >
  readonly eventHistoryLimit?: number
  readonly onStateEntered?: (
    state: ForegroundSessionState,
  ) => Promise<void> | void
}

export type ForegroundSessionOwnerLaunchResult<TSuccess> =
  | { readonly _tag: "Launched"; readonly value: TSuccess }
  | {
      readonly _tag: "Busy"
      readonly rejection: ForegroundSessionBusyRejection
    }
  | {
      readonly _tag: "Failed"
      readonly message: string
      readonly evidence?: Readonly<Record<string, unknown>>
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
>(
  options: ForegroundSessionOwnerOptions<
    TRequest,
    TPrepared,
    TSpawned,
    TSuccess
  >,
) {
  let state = foregroundSessionState.idleReady()
  let activeHandle: ForegroundManagedSessionHandle | undefined
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
        readonly stage: "adapter"
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

  const releaseToIdle = async (previousRequestId?: string) => {
    pushEvent(
      createForegroundSessionEvent({
        _tag: "ForegroundSessionReady",
        ...(previousRequestId ? { previousRequestId } : {}),
      }),
    )
    activeHandle = undefined
    const entered = setState(foregroundSessionState.idleReady())
    if (entered) await entered
  }

  const failAndRelease = async (
    active: ForegroundSessionActiveSession | undefined,
    message: string,
    evidence?: Readonly<Record<string, unknown>>,
  ): Promise<ForegroundSessionOwnerLaunchResult<TSuccess>> => {
    await terminateActiveHandle()
    await transition("Failed", {
      active,
      evidence,
      failure: { stage: "adapter", message, evidence },
    })
    await transition("Recovering", {
      active,
      evidence,
      failure: { stage: "adapter", message, evidence },
    })
    await releaseToIdle(active?.requestId)
    return { _tag: "Failed", message, ...(evidence ? { evidence } : {}) }
  }

  const observeExit = (
    handle: ForegroundManagedSessionHandle,
    active: ForegroundSessionActiveSession,
  ) => {
    void handle.exited.then(
      async terminal => {
        const current = activeSessionFromState(state)
        if (current?.requestId !== active.requestId || activeHandle !== handle)
          return
        const terminalActive = {
          ...active,
          terminal: { _tag: "Exited" as const, exitCode: terminal.exitCode },
        }
        pushEvent(
          createForegroundSessionEvent({
            _tag: "ForegroundSessionExited",
            requestId: active.requestId,
            terminal: terminalActive.terminal,
          }),
        )
        await transition("ExitObserved", { active: terminalActive })
        await transition("TearingDown", { active: terminalActive })
        await transition("VerifyingReady", { active: terminalActive })
        await releaseToIdle(active.requestId)
      },
      async error => {
        const current = activeSessionFromState(state)
        if (current?.requestId !== active.requestId || activeHandle !== handle)
          return
        const message = error instanceof Error ? error.message : String(error)
        await failAndRelease(active, message)
      },
    )
  }

  return {
    launch: async (
      request: TRequest,
    ): Promise<ForegroundSessionOwnerLaunchResult<TSuccess>> => {
      const identity = options.requestIdentity(request)
      const accepted = acceptForegroundSessionLaunch(state, identity)
      if (accepted._tag === "Rejected") {
        pushEvent(accepted.event)
        return { _tag: "Busy", rejection: accepted.rejection }
      }

      pushEvent(accepted.event)
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
          return await failAndRelease(active, spawned.message, spawned.evidence)
        }

        activeHandle = spawned.value.session
        active = {
          ...active,
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

        await transition("Running", { active, evidence: foreground.evidence })
        observeExit(spawned.value.session, active)
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
      const handle = activeHandle
      if (!handle) return
      handle.terminate()
      await handle.exited.catch(() => undefined)
    },

    terminateActiveSessionNow: (): void => {
      activeHandle?.terminateNow()
    },
  }
}
