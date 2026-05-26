import { describe, expect, it } from "bun:test"
import { createForegroundSessionOwner } from "./foreground-session-owner"

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

function createAdapter(options: {
  readonly prepare?: () => Promise<{ readonly gameId: string }>
  readonly spawn?: (
    prepared: { readonly gameId: string },
  ) => Promise<{
    readonly command: string
    readonly session: ReturnType<typeof createSession>
  }>
  readonly foreground?: () => Promise<
    | { readonly status: "ok"; readonly evidence?: Record<string, unknown> }
    | { readonly status: "warning"; readonly message: string }
  >
} = {}) {
  const calls: string[] = []
  const session = createSession()
  return {
    calls,
    session,
    adapter: {
      prepare: async () => {
        calls.push("prepare")
        return {
          status: "ok" as const,
          value: options.prepare
            ? await options.prepare()
            : { gameId: "gba/wario-land-4" },
          evidence: { stage: "prepare" },
        }
      },
      spawn: async (prepared: { readonly gameId: string }) => {
        calls.push("spawn")
        return {
          status: "ok" as const,
          value: options.spawn
            ? await options.spawn(prepared)
            : { command: "moonlight", session },
          evidence: { stage: "spawn" },
        }
      },
      foreground: async () => {
        calls.push("foreground")
        return options.foreground
          ? await options.foreground()
          : { status: "ok" as const, evidence: { repaired: true } }
      },
      launched: (input: { readonly prepared: { readonly gameId: string } }) => ({
        status: "launched" as const,
        gameId: input.prepared.gameId,
      }),
    },
  }
}

const request = { id: "gba/wario-land-4", hostId: "aka" }

function createOwner(adapter: ReturnType<typeof createAdapter>["adapter"], options = {}) {
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
    const prepare = deferred<{ readonly gameId: string }>()
    const setup = createAdapter({ prepare: () => prepare.promise })
    const owner = createOwner(setup.adapter)

    const first = owner.launch(request)
    await Promise.resolve()
    const second = await owner.launch({ id: "gba/metroid-fusion", hostId: "aka" })

    expect(second._tag).toBe("Busy")
    expect(setup.calls).toEqual(["prepare"])

    prepare.resolve({ gameId: "gba/wario-land-4" })
    await first
  })

  it("rejects during spawning and foregrounding without extra adapter invocation", async () => {
    const spawn = deferred<{ command: string; session: ReturnType<typeof createSession> }>()
    const setup = createAdapter({ spawn: () => spawn.promise })
    const owner = createOwner(setup.adapter)

    const first = owner.launch(request)
    await Promise.resolve()
    await Promise.resolve()
    const duringSpawn = await owner.launch({ id: "gba/metroid-fusion" })

    expect(duringSpawn._tag).toBe("Busy")
    expect(setup.calls).toEqual(["prepare", "spawn"])

    spawn.resolve({ command: "moonlight", session: setup.session })
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
    for (const tag of ["ExitObserved", "TearingDown", "VerifyingReady", "Failed", "Recovering"]) {
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
    await Promise.resolve()
    await Promise.resolve()
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
    const prepareFailure = createAdapter()
    prepareFailure.adapter.prepare = async () => ({
      status: "failed" as const,
      message: "prepare failed",
      evidence: { stage: "prepare" },
    })
    const prepareOwner = createOwner(prepareFailure.adapter)

    const prepareResult = await prepareOwner.launch(request)
    expect(prepareResult._tag).toBe("Failed")
    await prepareOwner.whenIdle()
    expect(prepareOwner.status().state._tag).toBe("IdleReady")

    const spawnFailure = createAdapter()
    spawnFailure.adapter.spawn = async () => ({
      status: "failed" as const,
      message: "spawn failed",
      evidence: { stage: "spawn" },
    })
    const spawnOwner = createOwner(spawnFailure.adapter)

    const spawnResult = await spawnOwner.launch(request)
    expect(spawnResult._tag).toBe("Failed")
    await spawnOwner.whenIdle()
    expect(spawnOwner.status().state._tag).toBe("IdleReady")
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
    const prepare = deferred<{ readonly gameId: string }>()
    const setup = createAdapter({ prepare: () => prepare.promise })
    const owner = createOwner(setup.adapter)

    const first = owner.launch(request)
    const second = owner.launch({ id: "gba/metroid-fusion" })
    const secondResult = await second

    expect(secondResult._tag).toBe("Busy")
    await Promise.resolve()
    expect(setup.calls).toEqual(["prepare"])
    prepare.resolve({ gameId: "gba/wario-land-4" })
    await first
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
