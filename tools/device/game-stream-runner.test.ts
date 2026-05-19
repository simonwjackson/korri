import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LaunchSpec } from "@shared/library/launcher"
import { createStaticGameStreamLaunchIntentStore } from "./game-stream-launch-intent"
import {
  createFileGameStreamRunLock,
  createGameStreamRunner,
  type ManagedChild,
  type ManagedChildSpawner,
} from "./game-stream-runner"

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

  it("cleans up the child when fullscreen repair fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(203)
    const { spawner } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
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
    expect(runner.status()).toMatchObject({
      mode: "failed",
      failureStage: "fullscreen",
    })
  })

  it("uses Gamescope around the configured command when enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(204)
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
      processEnv: sessionEnv,
      gamescope: {
        enabled: true,
        command: "/nix/store/gamescope/bin/gamescope",
      },
    })

    const run = runner.run()
    await waitFor(() => runner.status().mode === "running")
    controlled.exit(0)
    await run

    expect(specs[0]).toMatchObject({
      command: "/nix/store/gamescope/bin/gamescope",
      args: ["-f", "-b", "--", "/nix/store/neverball/bin/neverball"],
    })
  })

  it("fails before spawn when Sway repair lacks session environment", async () => {
    const controlled = createControlledChild(207)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
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
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
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
    const spawnFailure = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
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

  it("refuses root execution unless explicitly allowed", async () => {
    const controlled = createControlledChild(205)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: createStaticGameStreamLaunchIntentStore(game),
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 0 },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 126,
    })
    expect(specs).toHaveLength(0)
  })

  it("fails without consuming spawn when no launch intent is pending", async () => {
    const controlled = createControlledChild(212)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      launchIntentStore: {
        enqueue: async () => undefined,
        consume: async () => undefined,
      },
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
    })

    await expect(runner.run()).resolves.toMatchObject({
      status: "failed",
      stage: "preflight",
      exitCode: 125,
    })
    expect(specs).toHaveLength(0)
  })

  it("accepts arbitrary launch intents including Steam and browsers", async () => {
    const steam: LaunchSpec = {
      command: "/usr/bin/steam",
      args: ["steam://rungameid/123"],
    }
    const browser: LaunchSpec = {
      command: "/nix/store/firefox/bin/firefox",
      args: ["https://korri.local"],
    }

    for (const launch of [steam, browser]) {
      const controlled = createControlledChild(213)
      const { spawner, specs } = createControlledSpawner(controlled.child)
      const runner = createGameStreamRunner({
        launchIntentStore: createStaticGameStreamLaunchIntentStore(launch),
        spawner,
        logger: quietLogger(),
        processInfo: { pid: 10, uid: 1000 },
      })

      const run = runner.run()
      await waitFor(() => runner.status().mode === "running")
      controlled.exit(0)
      await expect(run).resolves.toEqual({ status: "launched", exitCode: 0 })
      expect(specs[0]).toEqual(launch)
    }
  })
})

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error("condition did not become true")
}
