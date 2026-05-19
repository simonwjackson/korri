import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { LaunchSpec } from "@shared/library/launcher"
import { logger as defaultLogger } from "@shared/logger"
import {
  composeGamescopeLaunchSpec,
  DEFAULT_GAMESCOPE_SELECTOR,
  repairStreamSurface,
  type GamescopeOptions,
  type RepairStreamSurfaceOptions,
} from "./game-stream-fullscreen"
import {
  beginGameStreamStart,
  beginGameStreamStopping,
  completeGameStreamExit,
  failGameStream,
  initialGameStreamState,
  markGameStreamFullscreenRepaired,
  markGameStreamRunning,
  type GameStreamFailureStage,
  type GameStreamState,
} from "./game-stream-state"

export type GameStreamRunResult =
  | { readonly status: "launched"; readonly exitCode: 0 }
  | {
      readonly status: "failed"
      readonly exitCode: number
      readonly stage: GameStreamFailureStage | "game"
      readonly message?: string
    }
  | { readonly status: "already-running" }

export interface ManagedChild {
  readonly pid: number
  readonly exited: Promise<number>
  terminate: (signal?: NodeJS.Signals) => Promise<void>
}

export interface ManagedChildSpawner {
  spawn: (spec: LaunchSpec) => Promise<ManagedChild>
}

export interface GameStreamRunLock {
  release: () => Promise<void>
}

export interface GameStreamRunLockManager {
  acquire: () => Promise<
    | { readonly acquired: true; readonly lock: GameStreamRunLock }
    | { readonly acquired: false; readonly reason: "already-running" }
  >
}

export interface GameStreamRunnerLogger {
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface GameStreamRunnerOptions {
  readonly game: LaunchSpec
  readonly spawner?: ManagedChildSpawner
  readonly lockManager?: GameStreamRunLockManager
  readonly gamescope?: GamescopeOptions
  readonly fullscreen?: RepairStreamSurfaceOptions
  readonly statusPath?: string
  readonly logger?: GameStreamRunnerLogger
  readonly processInfo?: {
    readonly pid: number
    readonly uid?: number
  }
  readonly allowRoot?: boolean
}

export interface GameStreamRunner {
  run: () => Promise<GameStreamRunResult>
  stop: () => Promise<void>
  status: () => GameStreamState
}

const DEFAULT_LOCK_PATH = "/tmp/korri-game-stream-runner.lock"

export function createGameStreamRunner(
  options: GameStreamRunnerOptions,
): GameStreamRunner {
  const logger = options.logger ?? defaultLogger
  const spawner = options.spawner ?? createBunManagedChildSpawner()
  const lockManager =
    options.lockManager ?? createFileGameStreamRunLock(DEFAULT_LOCK_PATH)
  const processInfo = options.processInfo ?? {
    pid: process.pid,
    uid: typeof process.getuid === "function" ? process.getuid() : undefined,
  }
  let state: GameStreamState = initialGameStreamState
  let activeChild: ManagedChild | undefined

  async function writeStatus() {
    if (!options.statusPath) return
    await mkdir(dirname(options.statusPath), { recursive: true, mode: 0o700 })
    await writeFile(options.statusPath, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    })
  }

  async function stop() {
    if (!activeChild) return
    state = beginGameStreamStopping(state)
    await writeStatus()
    await activeChild.terminate("SIGTERM")
  }

  async function fail(
    stage: GameStreamFailureStage,
    reason: string,
    exitCode = 1,
  ): Promise<GameStreamRunResult> {
    state = failGameStream(state, { stage, reason, exitCode })
    await writeStatus()
    return { status: "failed", stage, exitCode, message: reason }
  }

  return {
    status: () => state,
    stop,
    async run() {
      const runId = crypto.randomUUID()
      state = beginGameStreamStart(state, runId)
      await writeStatus()

      if (!options.allowRoot && processInfo.uid === 0) {
        return fail("preflight", "refusing to run game stream as root", 126)
      }

      const steamBoundary = validateSteamFreeCommand(options.game)
      if (!steamBoundary.ok) {
        return fail("preflight", steamBoundary.reason, 126)
      }

      const lockResult = await lockManager.acquire()
      if (!lockResult.acquired) {
        state = failGameStream(state, {
          stage: "lock",
          reason: "game stream is already running",
          exitCode: 125,
        })
        await writeStatus()
        return { status: "already-running" }
      }

      let releaseLock = true
      try {
        const spec = composeGamescopeLaunchSpec(
          options.game,
          options.gamescope ?? { enabled: false },
        )
        logger.info(
          { command: spec.command, argc: spec.args.length },
          "game-stream-runner: spawning game",
        )

        try {
          activeChild = await spawner.spawn(spec)
        } catch (error) {
          return await fail("spawn", errorMessage(error), 127)
        }

        state = markGameStreamRunning(state, activeChild.pid)
        await writeStatus()

        if (options.fullscreen) {
          try {
            await repairStreamSurface(options.fullscreen)
            state = markGameStreamFullscreenRepaired(state)
            await writeStatus()
          } catch (error) {
            await activeChild.terminate("SIGTERM")
            await activeChild.exited.catch(() => undefined)
            return await fail("fullscreen", errorMessage(error), 1)
          }
        }

        const exitCode = await activeChild.exited
        activeChild = undefined
        state = completeGameStreamExit(state, exitCode)
        await writeStatus()

        if (exitCode === 0) return { status: "launched", exitCode: 0 }
        return { status: "failed", stage: "game", exitCode }
      } finally {
        if (releaseLock) await lockResult.lock.release()
        releaseLock = false
        activeChild = undefined
      }
    },
  }
}

export function createBunManagedChildSpawner(options: {
  readonly setsidCommand?: string
  readonly env?: NodeJS.ProcessEnv
} = {}): ManagedChildSpawner {
  const setsidCommand = options.setsidCommand ?? "setsid"
  return {
    async spawn(spec) {
      const env = spec.env
        ? { ...(options.env ?? process.env), ...spec.env }
        : { ...(options.env ?? process.env) }
      const proc = Bun.spawn([setsidCommand, "--", spec.command, ...spec.args], {
        cwd: spec.cwd,
        env: env as Record<string, string>,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      })

      return {
        pid: proc.pid,
        exited: proc.exited,
        async terminate(signal: NodeJS.Signals = "SIGTERM") {
          try {
            process.kill(-proc.pid, signal)
          } catch {
            proc.kill(signal)
          }
        },
      }
    },
  }
}

export function createSwayCommandRunner(command = "swaymsg") {
  return {
    async run(args: readonly string[]): Promise<string> {
      const proc = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited
      if (exitCode !== 0) throw new Error(stderr || `swaymsg exited ${exitCode}`)
      return stdout
    },
  }
}

export function createFileGameStreamRunLock(
  lockPath: string,
  options: {
    readonly pid?: number
    readonly isProcessAlive?: (pid: number) => boolean
  } = {},
): GameStreamRunLockManager {
  const pid = options.pid ?? process.pid
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive

  return {
    async acquire() {
      await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 })
      try {
        const handle = await open(lockPath, "wx")
        await handle.writeFile(`${pid}\n`)
        await handle.close()
        return {
          acquired: true,
          lock: {
            async release() {
              await unlink(lockPath).catch(() => undefined)
            },
          },
        }
      } catch (error) {
        if (!isFileExistsError(error)) throw error
        const existingPid = await readExistingLockPid(lockPath)
        if (existingPid !== undefined && !isProcessAlive(existingPid)) {
          await unlink(lockPath).catch(() => undefined)
          return this.acquire()
        }
        return { acquired: false, reason: "already-running" }
      }
    },
  }
}

export function validateSteamFreeCommand(
  spec: LaunchSpec,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const values = [spec.command, ...spec.args]
  const steamLike = values.find(value => /(^|\/)steam$|steam:\/\//i.test(value))
  if (steamLike) {
    return { ok: false, reason: `Steam command is out of scope: ${steamLike}` }
  }
  const gamepadUi = values.find(value => /gamepadui|bigpicture/i.test(value))
  if (gamepadUi) {
    return { ok: false, reason: `Steam fullscreen UI is out of scope: ${gamepadUi}` }
  }
  return { ok: true }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function readExistingLockPid(lockPath: string): Promise<number | undefined> {
  const raw = await readFile(lockPath, "utf8").catch(() => undefined)
  if (!raw) return undefined
  const parsed = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "EEXIST"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function launchSpecFromEnv(env: NodeJS.ProcessEnv): LaunchSpec {
  const command = env.KORRI_GAME_STREAM_COMMAND
  if (!command) throw new Error("KORRI_GAME_STREAM_COMMAND is required")
  const args = env.KORRI_GAME_STREAM_ARGS_JSON
    ? (JSON.parse(env.KORRI_GAME_STREAM_ARGS_JSON) as string[])
    : []
  return {
    command,
    args,
    cwd: env.KORRI_GAME_STREAM_CWD,
  }
}

if (import.meta.main) {
  const game = launchSpecFromEnv(process.env)
  const lockPath = process.env.KORRI_GAME_STREAM_LOCK_PATH ?? DEFAULT_LOCK_PATH
  const statusPath = process.env.KORRI_GAME_STREAM_STATUS_PATH
  const useGamescope = process.env.KORRI_GAME_STREAM_USE_GAMESCOPE === "1"
  const repairSway = process.env.KORRI_GAME_STREAM_SWAY_REPAIR !== "0"
  const runner = createGameStreamRunner({
    game,
    statusPath,
    lockManager: createFileGameStreamRunLock(lockPath),
    gamescope: {
      enabled: useGamescope,
      command: process.env.KORRI_GAME_STREAM_GAMESCOPE,
    },
    fullscreen: repairSway
      ? {
          runner: createSwayCommandRunner(process.env.KORRI_GAME_STREAM_SWAYMSG),
          selector: DEFAULT_GAMESCOPE_SELECTOR,
        }
      : undefined,
  })

  const stop = () => {
    runner.stop().finally(() => undefined)
  }
  process.once("SIGTERM", stop)
  process.once("SIGINT", stop)

  const result = await runner.run()
  if (result.status === "launched") process.exit(0)
  if (result.status === "already-running") process.exit(125)
  process.exit(result.exitCode)
}
