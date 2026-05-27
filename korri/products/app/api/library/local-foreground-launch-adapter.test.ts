import { describe, expect, it } from "bun:test"
import { makeInMemoryLauncherLayer } from "@shared/library/launcher-layer-memory"
import {
  Launcher,
  type LauncherService,
} from "@shared/library/library-services"
import { Effect } from "effect"
import {
  createLocalForegroundLaunchOwner,
  launchLocalForegroundSession,
} from "./local-foreground-launch-adapter"

const spec = { command: "/bin/game", args: ["rom"] }

function spawnWith(launcher: LauncherService) {
  const spawn = launcher.spawn
  if (!spawn) throw new Error("launcher missing managed spawn")
  return Effect.runPromise(spawn(spec))
}

async function launcherFromLayer(
  layer: ReturnType<typeof makeInMemoryLauncherLayer>,
) {
  return await Effect.runPromise(
    Effect.gen(function* () {
      return yield* Launcher
    }).pipe(Effect.provide(layer)),
  )
}

describe("local foreground launch adapter", () => {
  it("holds the owner running until the managed local child exits", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner()

    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })
    await waitForOwnerState(owner, "Running")

    expect(owner.status().state).toMatchObject({
      _tag: "Running",
      active: { requestId: "local-launch-1", gameId: "game" },
    })

    control.resolveExit({ exitCode: 0 })
    expect(await launch).toEqual({ status: "launched" })
    await owner.whenIdle()
  })

  it("rejects a second local launch as session-busy before invoking spawn", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
    )
    const owner = createLocalForegroundLaunchOwner()
    let secondSpawnCalls = 0

    const first = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })
    await waitForOwnerState(owner, "Running")

    const second = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => {
        secondSpawnCalls += 1
        return spawnWith(launcher)
      },
      createRequestId: () => "local-launch-2",
    })

    expect(second).toMatchObject({
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    expect(secondSpawnCalls).toBe(0)

    control.resolveExit({ exitCode: 0 })
    await first
    await owner.whenIdle()
  })

  it("waits for managed readiness evidence after child exit before releasing idle", async () => {
    const owner = createLocalForegroundLaunchOwner()
    const exited = deferred<{ readonly exitCode: number | null }>()
    const ready = deferred<{
      readonly status: "ok"
      readonly evidence: { readonly gate: string }
    }>()
    let settled = false

    const launch = launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: async () => ({
        status: "started",
        result: ready.promise.then(() => ({ status: "launched" as const })),
        session: {
          id: "sessiond:launch-1",
          exited: exited.promise,
          ready: ready.promise,
          terminate: () => {},
          terminateNow: () => {},
        },
      }),
      createRequestId: () => "local-launch-1",
    })
    void launch.then(() => {
      settled = true
    })

    await waitForOwnerState(owner, "Running")
    exited.resolve({ exitCode: 0 })
    await waitForOwnerState(owner, "VerifyingReady")
    await Promise.resolve()

    expect(owner.status().state._tag).toBe("VerifyingReady")
    expect(settled).toBe(false)

    ready.resolve({ status: "ok", evidence: { gate: "sessiond-home-ready" } })
    expect(await launch).toEqual({ status: "launched" })
    await owner.whenIdle()
  })

  it("returns managed spawn failure diagnostics", async () => {
    const launcher = await launcherFromLayer(
      makeInMemoryLauncherLayer({
        behavior: { kind: "fail", exitCode: 125, stderrTail: "unsupported" },
      }),
    )
    const owner = createLocalForegroundLaunchOwner()

    const result = await launchLocalForegroundSession(owner, {
      id: "game",
      spec,
      spawn: () => spawnWith(launcher),
      createRequestId: () => "local-launch-1",
    })

    expect(result).toEqual({
      status: "failed",
      exitCode: 125,
      stderrTail: "unsupported",
    })
    expect(owner.status().state._tag).toBe("IdleReady")
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForOwnerState(
  owner: ReturnType<typeof createLocalForegroundLaunchOwner>,
  state: ReturnType<typeof owner.status>["state"]["_tag"],
) {
  for (let index = 0; index < 20; index += 1) {
    if (owner.status().state._tag === state) return
    await Promise.resolve()
  }
  expect(owner.status().state._tag).toBe(state)
}
