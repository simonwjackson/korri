import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  createFileGameStreamRunLock,
  createGameStreamRunner,
  validateSteamFreeCommand,
  type ManagedChild,
  type ManagedChildSpawner,
} from "./game-stream-runner"

const game: LaunchSpec = {
  command: "/nix/store/neverball/bin/neverball",
  args: [],
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
      game,
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
      game,
      spawner: firstSpawner.spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(lockPath, lockOptions),
    })
    const second = createGameStreamRunner({
      game,
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

  it("recovers a stale lock whose process is no longer alive", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const lockPath = join(dir, "run.lock")
    await writeFile(lockPath, "999999\n")
    const lock = createFileGameStreamRunLock(lockPath, {
      pid: 10,
      isProcessAlive: () => false,
    })

    const acquired = await lock.acquire()

    expect(acquired.acquired).toBe(true)
    if (acquired.acquired) await acquired.lock.release()
  })

  it("cleans up the child when fullscreen repair fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(203)
    const { spawner } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      game,
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      fullscreen: {
        selector: { appIds: ["gamescope"] },
        timeoutMs: 0,
        runner: { run: async () => JSON.stringify({ id: 1, nodes: [] }) },
      },
    })

    const result = await runner.run()

    expect(result).toMatchObject({ status: "failed", stage: "fullscreen" })
    expect(controlled.terminations).toEqual(["SIGTERM"])
    expect(runner.status()).toMatchObject({ mode: "failed", failureStage: "fullscreen" })
  })

  it("uses Gamescope around the configured command when enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-"))
    const controlled = createControlledChild(204)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      game,
      spawner,
      logger: quietLogger(),
      processInfo: { pid: 10, uid: 1000 },
      lockManager: createFileGameStreamRunLock(join(dir, "run.lock"), {
        pid: 10,
        isProcessAlive: pid => pid === 10,
      }),
      gamescope: { enabled: true, command: "/nix/store/gamescope/bin/gamescope" },
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

  it("refuses root execution unless explicitly allowed", async () => {
    const controlled = createControlledChild(205)
    const { spawner, specs } = createControlledSpawner(controlled.child)
    const runner = createGameStreamRunner({
      game,
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

  it("rejects Steam commands and fullscreen UI flags", () => {
    expect(
      validateSteamFreeCommand({ command: "/usr/bin/steam", args: [] }),
    ).toEqual({ ok: false, reason: "Steam command is out of scope: /usr/bin/steam" })
    expect(
      validateSteamFreeCommand({ command: "/bin/game", args: ["-gamepadui"] }),
    ).toEqual({ ok: false, reason: "Steam fullscreen UI is out of scope: -gamepadui" })
    expect(validateSteamFreeCommand(game)).toEqual({ ok: true })
  })
})

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error("condition did not become true")
}
