import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  Launcher,
  LaunchResult,
  LaunchSpec,
  ManagedLaunchResult,
} from "@shared/library/launcher"
import {
  createFileGameStreamLaunchIntentStore,
  createLaunchIntent,
  createStaticGameStreamLaunchIntentStore,
} from "./game-stream-launch-intent"
import {
  createFileGameStreamRunLock,
  createGameStreamRunner,
  defaultGameStreamLockPath,
  type GameStreamRunResult,
  type ManagedChild,
  type ManagedChildSpawner,
  superviseGameStreamRunner,
} from "./game-stream-runner"
import type { SwayNode } from "./sessiond-sway"

const game: LaunchSpec = {
  command: "/nix/store/neverball/bin/neverball",
  args: [],
}

const sessionEnv = {
  XDG_RUNTIME_DIR: "/run/user/1000",
  WAYLAND_DISPLAY: "wayland-1",
  SWAYSOCK: "/run/user/1000/sway-ipc.sock",
}

function createControlledChild(pid: number): {
  readonly child: ManagedChild
  exit: (exitCode: number) => void
  readonly terminations: readonly NodeJS.Signals[]
} {
  let exit: (exitCode: number) => void = () => undefined
  const terminations: NodeJS.Signals[] = []
  const exited = new Promise<number>(resolve => {
    exit = resolve
  })
  return {
    exit,
    terminations,
    child: {
      pid,
      exited,
      terminate: async (signal = "SIGTERM") => {
        terminations.push(signal)
        exit(143)
      },
    },
  }
}

function createControlledSpawner(child: ManagedChild): {
  readonly spawner: ManagedChildSpawner
  readonly specs: readonly LaunchSpec[]
} {
  const specs: LaunchSpec[] = []
  return {
    specs,
    spawner: {
      spawn: async spec => {
        specs.push(spec)
        return child
      },
    },
  }
}

function quietLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

describe("game stream runner", () => {
  it("derives the default run lock from XDG_RUNTIME_DIR", () => {
    expect(
      defaultGameStreamLockPath({
        XDG_RUNTIME_DIR: "/run/user/1000",
      } as NodeJS.ProcessEnv),
    ).toBe("/run/user/1000/korri-game-stream/run.lock")
    expect(defaultGameStreamLockPath({} as NodeJS.ProcessEnv)).toBe(
      "/tmp/korri-game-stream-runner.lock",
    )
  })

  it("runs one configured command, records status, and becomes rerunnable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const statusPath = join(dir, "status.json")
    const controlled = createControlledChild(200)
    const { spawner } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      statusPath,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    expect(runner.status()).toMatchObject({ mode: "running", childPid: 200 })

    controlled.exit(0)
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
    expect(runner.status()).toMatchObject({ mode: "exited", exitCode: 0 })
    expect(JSON.parse(await readFile(statusPath, "utf8"))).toMatchObject({
      mode: "exited",
      exitCode: 0,
    })
    expect((await stat(statusPath)).mode & 0o777).toBe(0o600)

    const nextChild = createControlledChild(206)
    const nextSpawner = createControlledSpawner(nextChild.child)
    const nextRunner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner: nextSpawner.spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })
    const nextRun = nextRunner.run()
    await waitFor(() => nextRunner.status().mode === "running")
    nextChild.exit(0)
    await expect(nextRun).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("rejects a second runner process while the first lock owner is active", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const lockPath = join(dir, "run.lock")
    const firstChild = createControlledChild(201)
    const firstSpawner = createControlledSpawner(firstChild.child)
    const secondChild = createControlledChild(202)
    const secondSpawner = createControlledSpawner(secondChild.child)
    const lockOptions = { pid: 10, isProcessAlive: (pid: number) => pid === 10 }
    const first = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner: firstSpawner.spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(lockPath, lockOptions),
    })
    const second = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner: secondSpawner.spawner,
      logger: quietLogger(),
      processInfo: { pid: 11, uid: 1000 },
      lockManager: createFileGameStreamRunLock(lockPath, {
        pid: 11,
        isProcessAlive: pid => pid === 10,
      }),
    })

    const firstRun = first.run()
    await waitFor(() => first.status().mode === "running")

    await expect(second.run()).resolves.toEqual({ status: "already-running" })
    expect(secondSpawner.specs).toHaveLength(0)

    firstChild.exit(0)
    await firstRun
  })

  it("recovers stale and malformed locks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const stalePath = join(dir, "stale.lock")
    await writeFile(stalePath, "999999\n")
    const staleLock = createFileGameStreamRunLock(stalePath, {
      pid: 10,
      isProcessAlive: () => false,
    })

    const stale = await staleLock.acquire()
    expect(stale.acquired).toBe(true)
    if (stale.acquired) await stale.lock.release()

    const malformedPath = join(dir, "malformed.lock")
    await writeFile(malformedPath, "not-a-pid\n")
    const malformedLock = createFileGameStreamRunLock(malformedPath, {
      pid: 10,
      isProcessAlive: () => true,
    })

    const malformed = await malformedLock.acquire()
    expect(malformed.acquired).toBe(true)
    if (malformed.acquired) await malformed.lock.release()
  })

  it("cleans up the child and requeues when fullscreen repair fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    let requeued = false
    const controlled = createControlledChild(203)
    const { spawner } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => ({
          intent: createLaunchIntent(game, { gamescope: { enabled: true } }),
          complete: async () => undefined,
          requeue: async () => {
            requeued = true
          },
          quarantine: async () => undefined,
        }),
      },
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      processEnv: sessionEnv,
      fullscreen: {
        selector: { appIds: ["gamescope"] },
        timeoutMs: 0,
        runner: { run: async () => JSON.stringify({ id: 1, nodes: [] }) },
      },
    })

    const result = await runner.run()

    expect(result).toMatchObject({ status: "failed", stage: "fullscreen" })
    expect(controlled.terminations).toEqual(["SIGTERM"])
    expect(requeued).toBe(true)
    expect(runner.status()).toMatchObject({
      mode: "failed",
      failureStage: "fullscreen",
    })
  })

  it("uses the managed Gamescope command when enabled without an intent command", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(204)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        gamescope: { enabled: true },
      }),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      processEnv: {
        ...sessionEnv,
        KORRI_GAME_STREAM_GAMESCOPE_COMMAND:
          "/nix/store/gamescope-wrapper/bin/gamescope",
      },
      fullscreen: {
        selector: { appIds: ["gamescope"] },
        runner: treeAfterSnapshotRunner(),
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controlled.exit(0)
    await run

    expect(specs[0]).toMatchObject({
      command: "/nix/store/gamescope-wrapper/bin/gamescope",
      args: ["-f", "-b", "--", "/nix/store/neverball/bin/neverball"],
    })
  })

  it("lets an absolute intent Gamescope command override the managed default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(222)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        gamescope: {
          enabled: true,
          command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
        },
      }),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      processEnv: {
        ...sessionEnv,
        KORRI_GAME_STREAM_GAMESCOPE_COMMAND:
          "/nix/store/gamescope-wrapper/bin/gamescope",
      },
      fullscreen: {
        selector: { appIds: ["gamescope"] },
        runner: treeAfterSnapshotRunner(),
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controlled.exit(0)
    await run

    expect(specs[0]).toMatchObject({
      command: "/run/current-system/sw/bin/korri-gamescope-no-portal",
      args: ["-f", "-b", "--", "/nix/store/neverball/bin/neverball"],
    })
  })

  it("fails before spawn when a managed run receives a PATH-based Gamescope command", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    let requeued = false
    const controlled = createControlledChild(223)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => ({
          intent: createLaunchIntent(game, {
            gamescope: { enabled: true, command: "gamescope" },
          }),
          complete: async () => undefined,
          requeue: async () => {
            requeued = true
          },
          quarantine: async () => undefined,
        }),
      },
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      processEnv: {
        ...sessionEnv,
        KORRI_GAME_STREAM_GAMESCOPE_COMMAND:
          "/nix/store/gamescope-wrapper/bin/gamescope",
      },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 126,
      message: expect.stringContaining("Gamescope command must be absolute"),
    })
    expect(specs).toHaveLength(0)
    expect(requeued).toBe(true)
  })

  it("repairs an explicitly unwrapped foreground launch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(217)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const calls: string[][] = []
    let getTreeCalls = 0
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        gamescope: { enabled: false },
      }),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      processEnv: sessionEnv,
      fullscreen: {
        selector: {},
        runner: {
          run: async args => {
            calls.push([...args])
            if (args.includes("get_tree")) {
              getTreeCalls += 1
              return JSON.stringify(
                getTreeCalls === 1
                  ? rawTreeBeforeLaunch()
                  : rawTreeAfterSnapshot(),
              )
            }
            return ""
          },
        },
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controlled.exit(0)
    await run

    expect(specs[0]).toEqual(game)
    expect(calls).toContainEqual(["[con_id=43] fullscreen enable"])
    expect(runner.status()).toMatchObject({ fullscreenRepaired: true })
  })

  it("fails before spawn when Sway repair lacks session environment", async () => {
    const controlled = createControlledChild(207)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        gamescope: { enabled: true },
      }),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {},
      fullscreen: {
        selector: { appIds: ["gamescope"] },
        runner: { run: async () => JSON.stringify({ id: 1, nodes: [] }) },
      },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 126,
    })
    expect(specs).toHaveLength(0)
  })

  it("does not spawn when stop is requested during startup", async () => {
    const controlled = createControlledChild(210)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    let releaseSnapshot: (value: string) => void = () => undefined
    let markSnapshotStarted: () => void = () => undefined
    const snapshotStarted = new Promise<void>(resolve => {
      markSnapshotStarted = resolve
    })
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        gamescope: { enabled: true },
      }),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: sessionEnv,
      fullscreen: {
        selector: { appIds: ["gamescope"] },
        runner: {
          run: async () => {
            markSnapshotStarted()
            return new Promise<string>(resolve => {
              releaseSnapshot = resolve
            })
          },
        },
      },
    })

    const run = runner.run()
    await snapshotStarted
    await runner.stop()
    releaseSnapshot(JSON.stringify({ id: 1, nodes: [] }))

    await expect(run).resolves.toMatchObject({
      status: "failed",
      stage: "cleanup",
    })
    expect(specs).toHaveLength(0)
  })

  it("keeps supervising the child if launch intent completion fails", async () => {
    const controlled = createControlledChild(216)
    const { spawner } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => ({
          intent: createLaunchIntent(game),
          complete: async () => {
            throw new Error("unlink failed")
          },
          requeue: async () => undefined,
          quarantine: async () => undefined,
        }),
      },
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controlled.exit(0)

    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("records lock acquisition failures", async () => {
    const controlled = createControlledChild(211)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: {
        acquire: async () => {
          throw new Error("lock denied")
        },
      },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "lock",
      exitCode: 125,
    })
    expect(specs).toHaveLength(0)
  })

  it("records spawn failure and non-zero game exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const intentPath = join(dir, "next-launch.json")
    const intentStore = createFileGameStreamLaunchIntentStore(intentPath)
    await intentStore.enqueue(createLaunchIntent(game))
    const spawnFailure = createGameStreamRunner({
      launchIntentStore: intentStore,
      spawner: {
        spawn: async () => {
          throw new Error("missing game")
        },
      },
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })
    await expect(spawnFailure.run()).resolves.toMatchObject({
      status: "failed",
      stage: "spawn",
      exitCode: 127,
    })
    await expect(intentStore.claim()).resolves.toMatchObject({
      intent: expect.objectContaining({ launch: game }),
    })

    const controlled = createControlledChild(208)
    const { spawner } = createControlledSpawner(controlled.child)
    const nonZero = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })
    const run = nonZero.run()
    await waitFor(() => nonZero.status().mode === "running")
    controlled.exit(7)
    await expect(run).resolves.toEqual({
      status: "failed",
      stage: "game",
      exitCode: 7,
    })
  })

  it("escalates stop cleanup to SIGKILL when the child ignores SIGTERM", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const terminations: NodeJS.Signals[] = []
    let exit: (exitCode: number) => void = () => undefined
    const child: ManagedChild = {
      pid: 209,
      exited: new Promise(resolve => {
        exit = resolve
      }),
      terminate: async signal => {
        terminations.push(signal ?? "SIGTERM")
        if (signal === "SIGKILL") exit(137)
      },
    }
    const { spawner } = createControlledSpawner(child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      terminateGraceMs: 1,
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    await runner.stop()
    await expect(run).resolves.toEqual({
      status: "failed",
      stage: "game",
      exitCode: 137,
    })
    expect(terminations).toEqual(["SIGTERM", "SIGKILL"])
  })

  it("classifies a stop that ends with a clean child exit as stopped, not launched", async () => {
    // Regression: when sunshine sends SIGTERM to the runner and the child
    // (e.g. SDL2 game) catches it and exits with code 0, the runner used to
    // report { status: "launched", exitCode: 0 } and the status file said
    // mode="exited", exitCode=0 — indistinguishable from a clean game exit.
    // After the fix, an explicit stop classifies as a stopped run
    // (exit code 143 — the SIGTERM convention) regardless of what the
    // child reported on its way out.
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const statusPath = join(dir, "status.json")
    const terminations: NodeJS.Signals[] = []
    let exit: (exitCode: number) => void = () => undefined
    const child: ManagedChild = {
      pid: 215,
      exited: new Promise(resolve => {
        exit = resolve
      }),
      terminate: async signal => {
        terminations.push(signal ?? "SIGTERM")
        // Game catches SIGTERM and exits gracefully with code 0.
        if (signal !== "SIGKILL") exit(0)
      },
    }
    const { spawner } = createControlledSpawner(child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      statusPath,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    await runner.stop()
    await expect(run).resolves.toEqual({
      status: "failed",
      stage: "game",
      exitCode: 143,
    })
    expect(terminations).toEqual(["SIGTERM"])
    expect(JSON.parse(await readFile(statusPath, "utf8"))).toMatchObject({
      mode: "exited",
      exitCode: 143,
    })
  })

  it("refuses root execution unless explicitly allowed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const statusPath = join(dir, "status.json")
    const controlled = createControlledChild(205)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      statusPath,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 0 },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 126,
    })
    expect(specs).toHaveLength(0)
    expect(JSON.parse(await readFile(statusPath, "utf8"))).toMatchObject({
      mode: "failed",
      failureStage: "preflight",
      exitCode: 126,
    })
  })

  it("does not spawn when stop is requested during intent claim", async () => {
    const controlled = createControlledChild(214)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    let releaseClaim: () => void = () => undefined
    let markClaimStarted: () => void = () => undefined
    const claimStarted = new Promise<void>(resolve => {
      markClaimStarted = resolve
    })
    let requeued = false
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => {
          markClaimStarted()
          await new Promise<void>(resolve => {
            releaseClaim = resolve
          })
          return {
            intent: createLaunchIntent(game),
            complete: async () => undefined,
            requeue: async () => {
              requeued = true
            },
            quarantine: async () => undefined,
          }
        },
      },
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await claimStarted
    await runner.stop()
    releaseClaim()

    await expect(run).resolves.toMatchObject({
      status: "failed",
      stage: "cleanup",
    })
    expect(specs).toHaveLength(0)
    expect(requeued).toBe(true)
  })

  it("fails without consuming spawn when no launch intent is pending", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const statusPath = join(dir, "status.json")
    const controlled = createControlledChild(212)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => undefined,
      },
      spawner,
      statusPath,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 125,
    })
    expect(runner.status()).toEqual({ mode: "idle" })
    expect(specs).toHaveLength(0)
    await expect(readFile(statusPath, "utf8")).rejects.toThrow()
  })

  it("preserves the last clean exit status when launched without a pending intent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const statusPath = join(dir, "status.json")
    const lastCleanExit = {
      mode: "exited",
      runId: "previous-run",
      exitCode: 0,
    }
    const statusBytes = Buffer.from(
      `${JSON.stringify(lastCleanExit, null, 2)}\n`,
    )
    await writeFile(statusPath, statusBytes)
    const controlled = createControlledChild(213)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => undefined,
      },
      spawner,
      statusPath,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 125,
      message: "no pending launch intent",
    })
    expect(runner.status()).toEqual({ mode: "idle" })
    expect(specs).toHaveLength(0)
    expect(Buffer.compare(await readFile(statusPath), statusBytes)).toBe(0)
  })

  it("preserves a previous failed status when launched without a pending intent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const statusPath = join(dir, "status.json")
    const lastFailure = {
      mode: "failed",
      runId: "previous-run",
      exitCode: 1,
      failureStage: "spawn",
      failureReason: "previous failure",
    }
    const statusBytes = Buffer.from(`${JSON.stringify(lastFailure, null, 2)}\n`)
    await writeFile(statusPath, statusBytes)
    const controlled = createControlledChild(213)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => undefined,
      },
      spawner,
      statusPath,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 125,
      message: "no pending launch intent",
    })
    expect(runner.status()).toEqual({ mode: "idle" })
    expect(specs).toHaveLength(0)
    expect(Buffer.compare(await readFile(statusPath), statusBytes)).toBe(0)
  })

  it("does not leave a session monitor intent claimed when the launcher fails", async () => {
    const launcher = createControlledChild(216)
    const wait: LaunchSpec = { command: "/bin/wait-for-game", args: [] }
    const specs: LaunchSpec[] = []
    let completed = false
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        claim: async () => ({
          intent: createLaunchIntent(game, { lifecycle: "session", wait }),
          complete: async () => {
            completed = true
          },
          requeue: async () => undefined,
          quarantine: async () => undefined,
        }),
      },
      spawner: {
        spawn: async spec => {
          specs.push(spec)
          return launcher.child
        },
      },
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    launcher.exit(7)

    await expect(run).resolves.toEqual({
      status: "failed",
      stage: "game",
      exitCode: 7,
    })
    expect(completed).toBe(true)
    expect(specs).toEqual([game])
  })

  it("waits for a session monitor intent after a launcher process exits", async () => {
    const launcher = createControlledChild(217)
    const monitor = createControlledChild(218)
    const specs: LaunchSpec[] = []
    const children = [launcher.child, monitor.child]
    const wait: LaunchSpec = { command: "/bin/wait-for-game", args: [] }
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        lifecycle: "session",
        wait,
      }),
      spawner: {
        spawn: async spec => {
          specs.push(spec)
          const child = children.shift()
          if (!child) throw new Error("unexpected spawn")
          return child
        },
      },
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    launcher.exit(0)
    await waitFor(() => runner.status().childPid === 218)
    monitor.exit(0)

    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
    expect(specs).toEqual([game, wait])
  })

  it("anchors the session if the wait monitor cannot start", async () => {
    const launcher = createControlledChild(219)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        lifecycle: "session",
        wait: { command: "/bin/missing-monitor", args: [] },
      }),
      spawner: {
        spawn: async spec => {
          if (spec.command === game.command) return launcher.child
          throw new Error("missing monitor")
        },
      },
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    launcher.exit(0)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(runner.status().mode).toBe("running")

    await runner.stop()
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("terminates a wait monitor spawned after stop was requested", async () => {
    const launcher = createControlledChild(220)
    const monitor = createControlledChild(221)
    let releaseMonitorSpawn: () => void = () => undefined
    let markMonitorSpawnStarted: () => void = () => undefined
    const monitorSpawnStarted = new Promise<void>(resolve => {
      markMonitorSpawnStarted = resolve
    })
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        lifecycle: "session",
        wait: { command: "/bin/wait-for-game", args: [] },
      }),
      spawner: {
        spawn: async spec => {
          if (spec.command === game.command) return launcher.child
          markMonitorSpawnStarted()
          await new Promise<void>(resolve => {
            releaseMonitorSpawn = resolve
          })
          return monitor.child
        },
      },
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    launcher.exit(0)
    await monitorSpawnStarted
    await runner.stop()
    releaseMonitorSpawn()

    await expect(run).resolves.toMatchObject({
      status: "failed",
      stage: "cleanup",
    })
    expect(monitor.terminations).toEqual(["SIGTERM"])
  })

  it("keeps launcher-style session intents alive after the initial process exits", async () => {
    const controlled = createControlledChild(215)
    const { spawner } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        lifecycle: "session",
      }),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controlled.exit(0)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(runner.status().mode).toBe("running")

    await runner.stop()
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("accepts arbitrary launch intents including Steam, browsers, and env overrides", async () => {
    const steam: LaunchSpec = {
      command: "/usr/bin/steam",
      args: ["steam://rungameid/123"],
    }
    const browser: LaunchSpec = {
      command: "/nix/store/firefox/bin/firefox",
      args: ["https://korri.local"],
    }
    const waylandGame: LaunchSpec = {
      command: "/nix/store/supertux/bin/supertux2",
      args: ["--fullscreen"],
      env: { SDL_VIDEODRIVER: "wayland" },
    }

    for (const launch of [steam, browser, waylandGame]) {
      const controlled = createControlledChild(213)
      const { spawner, specs } = createControlledSpawner(controlled.child)
      const logRecords: unknown[] = []
      const runner = createGameStreamRunner({
        launchIntentStore: createStaticGameStreamLaunchIntentStore(launch),
        spawner,
        logger: {
          info: input => logRecords.push(input),
          warn: input => logRecords.push(input),
          error: input => logRecords.push(input),
        },
        processInfo: { pid: 10, uid: 1000 },
      })

      const run = runner.run()
      await waitFor(() => runner.status().mode === "running")
      controlled.exit(0)
      await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
      expect(specs[0]).toEqual(launch)
      expect(JSON.stringify(logRecords)).not.toContain("wayland")
    }
  })
})

describe("game stream runner sessiond foreground branch", () => {
  it("routes lifecycle:foreground intents through the injected sessiondLauncher", async () => {
    const spawnedSpecs: LaunchSpec[] = []
    const { sessiondLauncher, controller } =
      createSessiondLauncherHarness(spawnedSpecs)
    const localSpecs: LaunchSpec[] = []
    const localSpawner: ManagedChildSpawner = {
      spawn: async spec => {
        localSpecs.push(spec)
        throw new Error(
          "local spawn must not be used on the foreground sessiond branch",
        )
      },
    }
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner: localSpawner,
      sessiondLauncher,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    expect(spawnedSpecs).toHaveLength(1)
    expect(spawnedSpecs[0].command).toBe(game.command)
    expect(localSpecs).toEqual([])

    controller.exit(0)
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("propagates the sessiond child exit code on success", async () => {
    const { sessiondLauncher, controller } = createSessiondLauncherHarness([])
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      sessiondLauncher,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controller.exit(0)
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("surfaces non-zero child exit through GameStreamRunResult", async () => {
    const { sessiondLauncher, controller } = createSessiondLauncherHarness([])
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      sessiondLauncher,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controller.failWith({
      status: "failed",
      exitCode: 7,
      stderrTail: "game crashed",
    })

    await expect(run).resolves.toMatchObject({
      status: "failed",
      exitCode: 7,
    })
  })

  it("fails closed without spawning locally when sessiond is unreachable", async () => {
    const failingLauncher: Launcher = {
      run: async () => ({
        status: "failed",
        exitCode: 125,
        stderrTail: "connection refused",
      }),
      spawn: async () => ({
        status: "failed",
        result: {
          status: "failed",
          exitCode: 125,
          stderrTail: "connection refused",
        },
      }),
    }
    let localSpawnCalled = false
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      sessiondLauncher: failingLauncher,
      spawner: {
        spawn: async () => {
          localSpawnCalled = true
          throw new Error("local spawn must not run")
        },
      },
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const result = await runner.run()
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(125)
    }
    expect(localSpawnCalled).toBe(false)
  })

  it("forwards stop() to sessiond terminate while a foreground launch is active", async () => {
    const { sessiondLauncher, controller } = createSessiondLauncherHarness([])
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      sessiondLauncher,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    await runner.stop()
    await waitFor(() => controller.terminateCalls.length > 0)
    expect(controller.terminateCalls).toContain("graceful")

    controller.failWith({
      status: "failed",
      exitCode: 143,
      stderrTail: "terminated",
    })
    const result = await run
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(143)
    }
  })

  it("falls through to the local spawn path when no sessiondLauncher is provided (back-compat)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-back-compat-"))
    const controlled = createControlledChild(450)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    expect(specs).toHaveLength(1)
    controlled.exit(0)
    await run
  })

  it("routes lifecycle:session intents through sessiond when configured and forwards wait spec via extras", async () => {
    // Phase 4D / Track A U6. Once sessiond understands session
    // lifecycle, the runner stops branching on lifecycle: it forwards
    // everything (foreground and session) and lets sessiond own the
    // anchor / wait-monitor semantics.
    const wait: LaunchSpec = { command: "/bin/wait-for-game", args: [] }
    const sessiondSpecs: LaunchSpec[] = []
    const extrasLog: Array<{
      readonly spec: LaunchSpec
      readonly extras?: unknown
    }> = []
    const { sessiondLauncher, controller } = createSessiondLauncherHarness(
      sessiondSpecs,
      extrasLog,
    )
    const localSpawnCalls: LaunchSpec[] = []
    const localSpawner: ManagedChildSpawner = {
      spawn: async spec => {
        localSpawnCalls.push(spec)
        throw new Error("local spawn must not run when sessiond is configured")
      },
    }
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        lifecycle: "session",
        wait,
      }),
      spawner: localSpawner,
      sessiondLauncher,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    expect(sessiondSpecs).toHaveLength(1)
    expect(extrasLog).toHaveLength(1)
    expect(extrasLog[0].extras).toEqual({
      lifecycle: "session",
      wait,
    })
    expect(localSpawnCalls).toEqual([])

    controller.exit(0)
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("routes lifecycle:session intents without wait through sessiond (anchor branch)", async () => {
    const sessiondSpecs: LaunchSpec[] = []
    const extrasLog: Array<{
      readonly spec: LaunchSpec
      readonly extras?: unknown
    }> = []
    const { sessiondLauncher, controller } = createSessiondLauncherHarness(
      sessiondSpecs,
      extrasLog,
    )
    const localSpawnCalls: LaunchSpec[] = []
    const localSpawner: ManagedChildSpawner = {
      spawn: async spec => {
        localSpawnCalls.push(spec)
        throw new Error("local spawn must not run when sessiond is configured")
      },
    }
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game, {
        lifecycle: "session",
      }),
      spawner: localSpawner,
      sessiondLauncher,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      processEnv: {
        ...sessionEnv,
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    expect(sessiondSpecs).toHaveLength(1)
    expect(extrasLog[0].extras).toEqual({ lifecycle: "session" })
    expect(localSpawnCalls).toEqual([])

    controller.exit(0)
    await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
  })

  it("keeps lifecycle:session intents on the local spawn path when no sessiondLauncher is configured (test path preserved)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-session-"))
    const controlled = createControlledChild(460)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const sessionIntentStore = createStaticGameStreamLaunchIntentStore(game, {
      lifecycle: "session",
    })
    const runner = createGameStreamRunner({
      launchIntentStore: sessionIntentStore,
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    expect(specs).toHaveLength(1)
    controlled.exit(0)
    await runner.stop()
    await run
  })
})

interface SessiondLauncherController {
  exit: (code: number) => void
  failWith: (result: LaunchResult) => void
  terminateCalls: NodeJS.Signals[] | string[]
}

function createSessiondLauncherHarness(
  specs: LaunchSpec[],
  extrasLog?: Array<{ readonly spec: LaunchSpec; readonly extras?: unknown }>,
): {
  readonly sessiondLauncher: Launcher
  readonly controller: SessiondLauncherController
} {
  let resolveResult: (value: LaunchResult) => void = () => {}
  let resolveExited: (value: { exitCode: number | null }) => void = () => {}
  const result = new Promise<LaunchResult>(resolve => {
    resolveResult = resolve
  })
  const exited = new Promise<{ exitCode: number | null }>(resolve => {
    resolveExited = resolve
  })
  const terminateCalls: string[] = []
  const controller: SessiondLauncherController = {
    exit: code => {
      resolveExited({ exitCode: code })
      resolveResult(
        code === 0
          ? { status: "launched" }
          : { status: "failed", exitCode: code, stderrTail: "non-zero" },
      )
    },
    failWith: launchResult => {
      resolveExited({
        exitCode:
          launchResult.status === "launched" ? 0 : launchResult.exitCode,
      })
      resolveResult(launchResult)
    },
    terminateCalls,
  }
  const sessiondLauncher: Launcher = {
    run: async () => result,
    spawn: async (spec, extras) => {
      specs.push(spec)
      extrasLog?.push({ spec, extras })
      return {
        status: "started",
        result,
        session: {
          id: "sessiond-harness-launch",
          processId: 12345,
          exited,
          terminate: () => terminateCalls.push("graceful"),
          terminateNow: () => terminateCalls.push("force"),
        },
      } satisfies ManagedLaunchResult
    },
  }
  return { sessiondLauncher, controller }
}

describe("superviseGameStreamRunner", () => {
  function createRecordingSignalSource() {
    const handlers = new Map<NodeJS.Signals, () => void>()
    return {
      listenSignal: (signal: NodeJS.Signals, handler: () => void) => {
        handlers.set(signal, handler)
      },
      deliver: (signal: NodeJS.Signals) => {
        const handler = handlers.get(signal)
        if (!handler) throw new Error(`no handler for ${signal}`)
        handler()
      },
    }
  }

  function createRunnerStub(result: Promise<GameStreamRunResult>): {
    readonly runner: {
      readonly run: () => Promise<GameStreamRunResult>
      readonly stop: () => Promise<void>
    }
    readonly stopCount: () => number
  } {
    let stopCalls = 0
    return {
      stopCount: () => stopCalls,
      runner: {
        run: () => result,
        stop: async () => {
          stopCalls += 1
        },
      },
    }
  }

  it("exits 0 when the runner reports launched", async () => {
    const exits: number[] = []
    const signals = createRecordingSignalSource()
    const { runner } = createRunnerStub(
      Promise.resolve<GameStreamRunResult>({
        status: "launched",
        exitCode: 0,
      }),
    )

    await superviseGameStreamRunner(runner, {
      listenSignal: signals.listenSignal,
      exit: code => exits.push(code),
    })

    expect(exits).toEqual([0])
  })

  it("exits 125 when the runner reports already-running", async () => {
    const exits: number[] = []
    const signals = createRecordingSignalSource()
    const { runner } = createRunnerStub(
      Promise.resolve<GameStreamRunResult>({ status: "already-running" }),
    )

    await superviseGameStreamRunner(runner, {
      listenSignal: signals.listenSignal,
      exit: code => exits.push(code),
    })

    expect(exits).toEqual([125])
  })

  it("exits with the failure exit code when the runner reports failed", async () => {
    const exits: number[] = []
    const signals = createRecordingSignalSource()
    const { runner } = createRunnerStub(
      Promise.resolve<GameStreamRunResult>({
        status: "failed",
        stage: "game",
        exitCode: 7,
      }),
    )

    await superviseGameStreamRunner(runner, {
      listenSignal: signals.listenSignal,
      exit: code => exits.push(code),
    })

    expect(exits).toEqual([7])
  })

  it("calls runner.stop and exits 143 on SIGTERM, even if run() never resolves", async () => {
    // Reproduces the leak we saw on aka: bun runner stayed alive after
    // killing its child because await runner.run() didn't actually
    // resolve in time — process.exit was never called from the natural
    // path. The signal handler must self-exit after stop() finishes.
    const exits: number[] = []
    const signals = createRecordingSignalSource()
    const neverResolves = new Promise<GameStreamRunResult>(() => undefined)
    const { runner, stopCount } = createRunnerStub(neverResolves)

    const supervised = superviseGameStreamRunner(runner, {
      listenSignal: signals.listenSignal,
      exit: code => exits.push(code),
    })

    signals.deliver("SIGTERM")
    // Yield twice so stop()'s microtask + the subsequent exit can run.
    await Promise.resolve()
    await Promise.resolve()

    expect(stopCount()).toBe(1)
    expect(exits).toEqual([143])
    // supervised is still pending because run() never resolves — but the
    // exit was already requested. In production, process.exit would have
    // terminated the process by now.
    void supervised
  })

  it("calls runner.stop and exits 130 on SIGINT", async () => {
    const exits: number[] = []
    const signals = createRecordingSignalSource()
    const neverResolves = new Promise<GameStreamRunResult>(() => undefined)
    const { runner, stopCount } = createRunnerStub(neverResolves)

    void superviseGameStreamRunner(runner, {
      listenSignal: signals.listenSignal,
      exit: code => exits.push(code),
    })

    signals.deliver("SIGINT")
    await Promise.resolve()
    await Promise.resolve()

    expect(stopCount()).toBe(1)
    expect(exits).toEqual([130])
  })

  it("does not double-exit when the signal arrives after run() resolves", async () => {
    const exits: number[] = []
    const signals = createRecordingSignalSource()
    const { runner } = createRunnerStub(
      Promise.resolve<GameStreamRunResult>({
        status: "launched",
        exitCode: 0,
      }),
    )

    await superviseGameStreamRunner(runner, {
      listenSignal: signals.listenSignal,
      exit: code => exits.push(code),
    })

    // Late signal after the supervisor already exited (production:
    // process.exit would have terminated the process). The handler must
    // not call exit a second time.
    signals.deliver("SIGTERM")
    await Promise.resolve()
    await Promise.resolve()

    expect(exits).toEqual([0])
  })
})

function rawTreeBeforeLaunch(): SwayNode {
  return {
    id: 1,
    nodes: [
      {
        id: 10,
        nodes: [
          { id: 42, app_id: "firefox", focused: true, fullscreen_mode: 1 },
        ],
      },
    ],
  }
}

function rawTreeAfterSnapshot(): SwayNode {
  return {
    id: 1,
    nodes: [
      {
        id: 10,
        nodes: [
          { id: 42, app_id: "firefox", focused: true, fullscreen_mode: 1 },
          { id: 43, app_id: "neverball", focused: false, fullscreen_mode: 0 },
        ],
      },
    ],
  }
}

function treeAfterSnapshotRunner() {
  let getTreeCalls = 0
  return {
    async run(args: readonly string[]): Promise<string> {
      if (args[0] !== "-t") return ""
      getTreeCalls += 1
      if (getTreeCalls === 1) return JSON.stringify({ id: 1, nodes: [] })
      return JSON.stringify({
        id: 1,
        nodes: [
          {
            id: 2,
            nodes: [
              {
                id: 42,
                app_id: "gamescope",
                focused: false,
                fullscreen_mode: 0,
                name: "gamescope",
              },
            ],
          },
        ],
      })
    },
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error("condition did not become true")
}
