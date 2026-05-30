import { describe, expect, it } from "bun:test"
import type { ForegroundSessionState } from "./foreground-session-lifecycle"
import {
  createForegroundSessionOwner,
  type ForegroundSessionAdapter,
  type ForegroundSessionForegroundResult,
  type ForegroundSessionReadinessInput,
  type ForegroundSessionStageResult,
} from "./foreground-session-owner"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(count = 5) {
  for (let index = 0; index < count; index += 1) await Promise.resolve()
}

function createSession(id = "child-1") {
  const exit = deferred<{ readonly exitCode: number | null }>()
  const signals: string[] = []
  return {
    id,
    processId: 4242,
    exited: exit.promise,
    terminate: () => signals.push("SIGTERM"),
    terminateNow: () => signals.push("SIGKILL"),
    exit,
    signals,
  }
}

type TestRequest = { readonly id: string; readonly hostId?: string }

type TestPrepared = { readonly gameId: string }

type TestSpawned = {
  readonly command: string
  readonly session: ReturnType<typeof createSession>
}

type TestLaunchResult = { readonly status: "launched"; readonly gameId: string }

type TestAdapter = ForegroundSessionAdapter<
  TestRequest,
  TestPrepared,
  TestSpawned,
  TestLaunchResult
>

function createAdapter(
  options: {
    readonly prepare?: () => Promise<
      TestPrepared | ForegroundSessionStageResult<TestPrepared>
    >
    readonly spawn?: (
      prepared: TestPrepared,
    ) => Promise<TestSpawned | ForegroundSessionStageResult<TestSpawned>>
    readonly foreground?: () => Promise<ForegroundSessionForegroundResult>
    readonly teardown?: (
      input: ForegroundSessionReadinessInput<
        TestRequest,
        TestPrepared,
        TestSpawned
      >,
    ) => Promise<ForegroundSessionStageResult<Record<string, unknown>>>
    readonly verifyReady?: (
      input: ForegroundSessionReadinessInput<
        TestRequest,
        TestPrepared,
        TestSpawned
      >,
    ) => Promise<ForegroundSessionStageResult<Record<string, unknown>>>
  } = {},
) {
  const calls: string[] = []
  const session = createSession()
  const adapter: TestAdapter = {
    prepare: async () => {
      calls.push("prepare")
      const prepared = await options.prepare?.()
      if (!prepared) {
        return {
          status: "ok" as const,
          value: { gameId: "gba/wario-land-4" },
          evidence: { stage: "prepare" },
        }
      }
      if ("status" in prepared) return prepared
      return {
        status: "ok" as const,
        value: prepared,
        evidence: { stage: "prepare" },
      }
    },
    spawn: async (prepared: TestPrepared) => {
      calls.push("spawn")
      const spawned = await options.spawn?.(prepared)
      if (!spawned) {
        return {
          status: "ok" as const,
          value: { command: "moonlight", session },
          evidence: { stage: "spawn" },
        }
      }
      if ("status" in spawned) return spawned
      return {
        status: "ok" as const,
        value: spawned,
        evidence: { stage: "spawn" },
      }
    },
    foreground: async () => {
      calls.push("foreground")
      return (
        (await options.foreground?.()) ?? {
          status: "ok" as const,
          evidence: { repaired: true },
        }
      )
    },
    teardown: async input => {
      calls.push("teardown")
      return (
        (await options.teardown?.(input)) ?? {
          status: "ok" as const,
          value: { gate: "teardown" },
        }
      )
    },
    verifyReady: async input => {
      calls.push("verifyReady")
      return (
        (await options.verifyReady?.(input)) ?? {
          status: "ok" as const,
          value: { gate: "ready" },
        }
      )
    },
    launched: (input: { readonly prepared: TestPrepared }) => ({
      status: "launched" as const,
      gameId: input.prepared.gameId,
    }),
  }

  return { calls, session, adapter }
}

const request: TestRequest = { id: "gba/wario-land-4", hostId: "aka" }

function createOwner(
  adapter: TestAdapter,
  options: {
    readonly onStateEntered?: (
      state: ForegroundSessionState,
    ) => void | Promise<void>
    readonly consultExternalIdle?: () => Promise<
      import("./foreground-session-owner").ForegroundExternalIdleResult
    >
  } = {},
) {
  return createForegroundSessionOwner({
    requestIdentity: input => ({
      requestId: input.id,
      gameId: input.id,
      hostId: input.hostId,
    }),
    adapter,
    ...options,
  })
}

describe("foreground session owner", () => {
  it("runs teardown and readiness gates after exit before returning idle-ready", async () => {
    const teardown =
      deferred<ForegroundSessionStageResult<Record<string, unknown>>>()
    const verifyReady =
      deferred<ForegroundSessionStageResult<Record<string, unknown>>>()
    const setup = createAdapter({
      teardown: () => teardown.promise,
      verifyReady: () => verifyReady.promise,
    })
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    setup.session.exit.resolve({ exitCode: 0 })
    await flushMicrotasks()

    expect(owner.status().state._tag).toBe("TearingDown")
    expect((await owner.launch({ id: "gba/metroid-fusion" }))._tag).toBe("Busy")

    teardown.resolve({ status: "ok", value: { gate: "teardown" } })
    await flushMicrotasks()
    expect(owner.status().state._tag).toBe("VerifyingReady")
    expect((await owner.launch({ id: "gba/zelda" }))._tag).toBe("Busy")

    verifyReady.resolve({ status: "ok", value: { gate: "ready" } })
    await owner.whenIdle()

    expect(owner.status().state._tag).toBe("IdleReady")
    expect(setup.calls).toEqual([
      "prepare",
      "spawn",
      "foreground",
      "teardown",
      "verifyReady",
    ])
    expect(owner.status().events.at(-1)).toMatchObject({
      _tag: "ForegroundSessionReady",
      evidence: { gate: "ready" },
    })
  })

  it("records teardown throws as cleanup failures and releases idle", async () => {
    const setup = createAdapter({
      teardown: async () => {
        throw new Error("cleanup exploded")
      },
    })
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    setup.session.exit.resolve({ exitCode: 0 })
    await owner.whenIdle()

    expect(owner.status().state._tag).toBe("IdleReady")
    expect(owner.status().events).toContainEqual(
      expect.objectContaining({
        _tag: "ForegroundSessionStateChanged",
        nextState: "Failed",
        evidence: { stage: "cleanup", message: "cleanup exploded" },
      }),
    )
  })

  it("records readiness failures without losing terminal status", async () => {
    const setup = createAdapter({
      verifyReady: async () => ({
        status: "failed",
        message: "surface remained",
        evidence: { gate: "surface", remainingWindowIds: [44] },
      }),
    })
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    setup.session.exit.resolve({ exitCode: 0 })
    await owner.whenIdle()

    expect(owner.status().state._tag).toBe("IdleReady")
    expect(owner.status().events).toContainEqual(
      expect.objectContaining({
        _tag: "ForegroundSessionStateChanged",
        nextState: "Failed",
        evidence: { gate: "surface", remainingWindowIds: [44] },
      }),
    )
  })

  it("passes cancellation to teardown and readiness during shutdown", async () => {
    const teardown =
      deferred<ForegroundSessionStageResult<Record<string, unknown>>>()
    let teardownSignal: AbortSignal | undefined
    const setup = createAdapter({
      teardown: input => {
        teardownSignal = input.signal
        return teardown.promise
      },
    })
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    setup.session.exit.resolve({ exitCode: 0 })
    await flushMicrotasks()

    const shutdown = owner.terminateActiveSession()
    expect(teardownSignal?.aborted).toBe(true)
    teardown.resolve({ status: "ok", value: { cancelled: true } })
    await shutdown
    await flushMicrotasks()

    expect(owner.status().events.map(event => event._tag)).not.toContain(
      "ForegroundSessionReady",
    )
  })

  it("accepts from idle, enters running, observes exit, and returns to idle-ready", async () => {
    const setup = createAdapter()
    const owner = createOwner(setup.adapter)

    const result = await owner.launch(request)

    expect(result._tag).toBe("Launched")
    expect(owner.status().state._tag).toBe("Running")
    expect(setup.calls).toEqual(["prepare", "spawn", "foreground"])

    setup.session.exit.resolve({ exitCode: 0 })
    await owner.whenIdle()

    expect(owner.status().state._tag).toBe("IdleReady")
  })

  it("rejects a second launch during preparing without invoking the adapter again", async () => {
    const prepare = deferred<ForegroundSessionStageResult<TestPrepared>>()
    const setup = createAdapter({ prepare: () => prepare.promise })
    const owner = createOwner(setup.adapter)

    const first = owner.launch(request)
    await Promise.resolve()
    const second = await owner.launch({
      id: "gba/metroid-fusion",
      hostId: "aka",
    })

    expect(second._tag).toBe("Busy")
    expect(setup.calls).toEqual(["prepare"])

    prepare.resolve({
      status: "ok",
      value: { gameId: "gba/wario-land-4" },
    })
    await first
  })

  it("rejects during spawning and foregrounding without extra adapter invocation", async () => {
    const spawn = deferred<ForegroundSessionStageResult<TestSpawned>>()
    const setup = createAdapter({ spawn: () => spawn.promise })
    const owner = createOwner(setup.adapter)

    const first = owner.launch(request)
    await Promise.resolve()
    await Promise.resolve()
    const duringSpawn = await owner.launch({ id: "gba/metroid-fusion" })

    expect(duringSpawn._tag).toBe("Busy")
    expect(setup.calls).toEqual(["prepare", "spawn"])

    spawn.resolve({
      status: "ok",
      value: { command: "moonlight", session: setup.session },
    })
    await first

    const foreground = deferred<{
      readonly status: "ok"
      readonly evidence?: Record<string, unknown>
    }>()
    const setup2 = createAdapter({ foreground: () => foreground.promise })
    const owner2 = createOwner(setup2.adapter)
    const foregroundLaunch = owner2.launch(request)
    await flushMicrotasks(20)

    const duringForeground = await owner2.launch({ id: "gba/zelda" })
    expect(duringForeground._tag).toBe("Busy")
    expect(setup2.calls).toEqual(["prepare", "spawn", "foreground"])

    foreground.resolve({ status: "ok" })
    await foregroundLaunch
  })

  it("rejects while running until the managed session exits", async () => {
    const setup = createAdapter()
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    const busy = await owner.launch({ id: "gba/metroid-fusion" })

    expect(busy._tag).toBe("Busy")
    if (busy._tag === "Busy") {
      expect(busy.rejection.currentState).toBe("Running")
      expect(busy.rejection.currentGameId).toBe("gba/wario-land-4")
    }
  })

  it("rejects during exit-observed, tearing-down, verifying-ready, failed, and recovering", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<void>>>()
    for (const tag of [
      "ExitObserved",
      "TearingDown",
      "VerifyingReady",
      "Failed",
      "Recovering",
    ]) {
      gates.set(tag, deferred<void>())
    }
    const setup = createAdapter()
    const owner = createOwner(setup.adapter, {
      onStateEntered: state => gates.get(state._tag)?.promise,
    })

    await owner.launch(request)
    setup.session.exit.resolve({ exitCode: 0 })
    await Promise.resolve()
    expect(owner.status().state._tag).toBe("ExitObserved")
    expect((await owner.launch({ id: "gba/one" }))._tag).toBe("Busy")
    gates.get("ExitObserved")?.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(owner.status().state._tag).toBe("TearingDown")
    expect((await owner.launch({ id: "gba/two" }))._tag).toBe("Busy")
    gates.get("TearingDown")?.resolve()
    await flushMicrotasks()
    expect(owner.status().state._tag).toBe("VerifyingReady")
    expect((await owner.launch({ id: "gba/three" }))._tag).toBe("Busy")
    gates.get("VerifyingReady")?.resolve()
    await owner.whenIdle()

    const failing = createAdapter({
      prepare: async () => {
        throw new Error("prepare exploded")
      },
    })
    const failingOwner = createOwner(failing.adapter, {
      onStateEntered: state => gates.get(state._tag)?.promise,
    })
    const failedLaunch = failingOwner.launch(request)
    await flushMicrotasks()
    expect(failingOwner.status().state._tag).toBe("Failed")
    expect((await failingOwner.launch({ id: "gba/four" }))._tag).toBe("Busy")
    gates.get("Failed")?.resolve()
    await flushMicrotasks()
    expect(failingOwner.status().state._tag).toBe("Recovering")
    expect((await failingOwner.launch({ id: "gba/five" }))._tag).toBe("Busy")
    gates.get("Recovering")?.resolve()
    await failedLaunch
  })

  it("records prepare and spawn failures then releases back to idle-ready", async () => {
    const prepareFailure = createAdapter({
      prepare: async () => ({
        status: "failed" as const,
        message: "prepare failed",
        evidence: { stage: "prepare" },
      }),
    })
    const prepareOwner = createOwner(prepareFailure.adapter)

    const prepareResult = await prepareOwner.launch(request)
    expect(prepareResult._tag).toBe("Failed")
    await prepareOwner.whenIdle()
    expect(prepareOwner.status().state._tag).toBe("IdleReady")

    const spawnFailure = createAdapter({
      spawn: async () => ({
        status: "failed" as const,
        message: "spawn failed",
        evidence: { stage: "spawn" },
      }),
    })
    const spawnOwner = createOwner(spawnFailure.adapter)

    const spawnResult = await spawnOwner.launch(request)
    expect(spawnResult._tag).toBe("Failed")
    await spawnOwner.whenIdle()
    expect(spawnOwner.status().state._tag).toBe("IdleReady")
  })

  it("terminates a spawned session when foreground fails before running", async () => {
    const setup = createAdapter({
      foreground: async () => ({
        status: "failed",
        message: "foreground failed",
      }),
    })
    const owner = createOwner(setup.adapter)

    const result = owner.launch(request)
    await flushMicrotasks(20)

    expect(setup.session.signals).toEqual(["SIGTERM"])
    setup.session.exit.resolve({ exitCode: 1 })
    expect(await result).toMatchObject({
      _tag: "Failed",
      message: "foreground failed",
    })
    await owner.whenIdle()
    expect(owner.status().state._tag).toBe("IdleReady")
  })

  it("releases a running session when exit observation rejects", async () => {
    const setup = createAdapter()
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    setup.session.exit.reject(new Error("lost child observer"))
    await owner.whenIdle()

    expect(owner.status().state._tag).toBe("IdleReady")
  })

  it("keeps foreground warnings non-fatal and records lifecycle events in order", async () => {
    const setup = createAdapter({
      foreground: async () => ({ status: "warning", message: "repair failed" }),
    })
    const owner = createOwner(setup.adapter)

    const result = await owner.launch(request)

    expect(result._tag).toBe("Launched")
    expect(owner.status().state._tag).toBe("Running")
    expect(owner.status().events.map(event => event._tag)).toContain(
      "ForegroundSessionForegroundWarning",
    )
    expect(owner.status().events.map(event => event._tag)).toEqual([
      "ForegroundSessionLaunchAccepted",
      "ForegroundSessionAdapterOutcome",
      "ForegroundSessionStateChanged",
      "ForegroundSessionAdapterOutcome",
      "ForegroundSessionStateChanged",
      "ForegroundSessionForegroundWarning",
      "ForegroundSessionStateChanged",
    ])
  })

  it("allows exactly one adapter invocation for two same-turn launches", async () => {
    const prepare = deferred<ForegroundSessionStageResult<TestPrepared>>()
    const setup = createAdapter({ prepare: () => prepare.promise })
    const owner = createOwner(setup.adapter)

    const first = owner.launch(request)
    const second = owner.launch({ id: "gba/metroid-fusion" })
    const secondResult = await second

    expect(secondResult._tag).toBe("Busy")
    await Promise.resolve()
    expect(setup.calls).toEqual(["prepare"])
    prepare.resolve({
      status: "ok",
      value: { gameId: "gba/wario-land-4" },
    })
    await first
  })

  describe("consultExternalIdle preflight", () => {
    it("accepts the launch when the external authority reports idle", async () => {
      const setup = createAdapter()
      const owner = createOwner(setup.adapter, {
        consultExternalIdle: async () => ({ status: "idle" }),
      })
      const result = await owner.launch(request)
      expect(result._tag).toBe("Launched")
      expect(setup.calls).toContain("prepare")
    })

    it("rejects as Busy with source=sessiond when external authority reports game", async () => {
      const setup = createAdapter()
      const owner = createOwner(setup.adapter, {
        consultExternalIdle: async () => ({
          status: "not-idle",
          mode: "game",
        }),
      })
      const result = await owner.launch(request)
      expect(result._tag).toBe("Busy")
      if (result._tag !== "Busy") throw new Error("unreachable")
      expect(result.rejection.source).toBe("sessiond")
      expect(result.rejection.externalMode).toBe("game")
      // No adapter side-effects when the preflight rejected.
      expect(setup.calls).toEqual([])
    })

    for (const mode of ["launching", "restoring", "recovering"]) {
      it(`rejects as Busy with source=sessiond when external authority reports ${mode}`, async () => {
        const setup = createAdapter()
        const owner = createOwner(setup.adapter, {
          consultExternalIdle: async () => ({
            status: "not-idle",
            mode,
          }),
        })
        const result = await owner.launch(request)
        expect(result._tag).toBe("Busy")
        if (result._tag !== "Busy") throw new Error("unreachable")
        expect(result.rejection.source).toBe("sessiond")
        expect(result.rejection.externalMode).toBe(mode)
        expect(setup.calls).toEqual([])
      })
    }

    it("rejects as ExternalUnavailable with reason=network when external authority is unreachable", async () => {
      const setup = createAdapter()
      const owner = createOwner(setup.adapter, {
        consultExternalIdle: async () => ({
          status: "unavailable",
          reason: "network",
        }),
      })
      const result = await owner.launch(request)
      expect(result._tag).toBe("ExternalUnavailable")
      if (result._tag !== "ExternalUnavailable") throw new Error("unreachable")
      expect(result.reason).toBe("network")
      expect(setup.calls).toEqual([])
    })

    it("rejects as ExternalUnavailable with reason=token-rejected when the daemon returns 401", async () => {
      const setup = createAdapter()
      const owner = createOwner(setup.adapter, {
        consultExternalIdle: async () => ({
          status: "unavailable",
          reason: "token-rejected",
        }),
      })
      const result = await owner.launch(request)
      expect(result._tag).toBe("ExternalUnavailable")
      if (result._tag !== "ExternalUnavailable") throw new Error("unreachable")
      expect(result.reason).toBe("token-rejected")
      expect(setup.calls).toEqual([])
    })

    it("rejects on owner-local state when external reports idle but owner is already Running", async () => {
      // First launch holds the owner in Running.
      const setup = createAdapter()
      const owner = createOwner(setup.adapter, {
        consultExternalIdle: async () => ({ status: "idle" }),
      })
      const firstResult = await owner.launch(request)
      expect(firstResult._tag).toBe("Launched")

      // Second launch: external authority STILL reports idle (stale daemon),
      // but the owner-local check must catch the re-entry.
      const second = await owner.launch({ id: "gba/metroid-fusion" })
      expect(second._tag).toBe("Busy")
      if (second._tag !== "Busy") throw new Error("unreachable")
      expect(second.rejection.source).toBe("owner-local")
      expect(second.rejection.externalMode).toBeUndefined()
    })

    it("behaves as today when consultExternalIdle is unset (live-USB / unconfigured)", async () => {
      const setup = createAdapter()
      const owner = createOwner(setup.adapter)
      const result = await owner.launch(request)
      expect(result._tag).toBe("Launched")
      // Re-entry is still caught by the owner-local check.
      const second = await owner.launch({ id: "gba/metroid-fusion" })
      expect(second._tag).toBe("Busy")
      if (second._tag !== "Busy") throw new Error("unreachable")
      expect(second.rejection.source).toBe("owner-local")
    })

    it("runs the preflight BEFORE adapter.prepare so a sessiond-busy rejection does not leak side-effects", async () => {
      const setup = createAdapter()
      const owner = createOwner(setup.adapter, {
        consultExternalIdle: async () => ({
          status: "not-idle",
          mode: "game",
        }),
      })
      await owner.launch(request)
      expect(setup.calls).toEqual([])
    })
  })

  it("terminates active sessions through graceful and emergency shutdown paths", async () => {
    const setup = createAdapter()
    const owner = createOwner(setup.adapter)

    await owner.launch(request)
    const graceful = owner.terminateActiveSession()
    expect(setup.session.signals).toEqual(["SIGTERM"])
    setup.session.exit.resolve({ exitCode: 0 })
    await graceful
    await owner.whenIdle()

    const setup2 = createAdapter()
    const owner2 = createOwner(setup2.adapter)
    await owner2.launch(request)
    owner2.terminateActiveSessionNow()
    expect(setup2.session.signals).toEqual(["SIGKILL"])
  })
})
