import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { LaunchSpec } from "@shared/library/launcher"
import { logger as defaultLogger } from "@shared/logger"
import {
  composeGamescopeLaunchSpec,
  DEFAULT_GAMESCOPE_SELECTOR,
  type GamescopeOptions,
  type RepairStreamSurfaceOptions,
  repairStreamSurface,
  snapshotStreamSurfaceIds,
} from "./game-stream-fullscreen"
import {
  beginGameStreamStart,
  beginGameStreamStopping,
  canStartGameStream,
  completeGameStreamExit,
  failGameStream,
  type GameStreamFailureStage,
  type GameStreamState,
  initialGameStreamState,
  markGameStreamFullscreenRepaired,
  markGameStreamRunning,
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
  readonly processEnv?: NodeJS.ProcessEnv
  readonly allowRoot?: boolean
  readonly terminateGraceMs?: number
}

export interface GameStreamRunner {
  run: () => Promise<GameStreamRunResult>
  stop: () => Promise<void>
  status: () => GameStreamState
}

const DEFAULT_LOCK_PATH = "/tmp/korri-game-stream-runner.lock"
const DEFAULT_TERMINATE_GRACE_MS = 2_000
const DEFAULT_SWAY_COMMAND_TIMEOUT_MS = 2_000

export function createGameStreamRunner(
  options: GameStreamRunnerOptions,
): GameStreamRunner {
  const logger = options.logger ?? defaultLogger
  const spawner = options.spawner ?? createBunManagedChildSpawner()
  const processInfo = options.processInfo ?? {
    pid: process.pid,
    uid: typeof process.getuid === "function" ? process.getuid() : undefined,
  }
  const lockManager =
    options.lockManager ??
    createFileGameStreamRunLock(DEFAULT_LOCK_PATH, { pid: processInfo.pid })
  const processEnv = options.processEnv ?? process.env
  const terminateGraceMs =
    options.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS
  let state: GameStreamState = initialGameStreamState
  let activeChild: ManagedChild | undefined
  let stopRequested = false

  async function writeStatus() {
    if (!options.statusPath) return
    try {
      await mkdir(dirname(options.statusPath), { recursive: true, mode: 0o700 })
      await writeFile(
        options.statusPath,
        `${JSON.stringify(state, null, 2)}\n`,
        {
          mode: 0o600,
        },
      )
    } catch (error) {
      logger.warn(
        { err: error, statusPath: options.statusPath },
        "game-stream-runner: status write failed",
      )
    }
  }

  async function stop() {
    stopRequested = true
    state = beginGameStreamStopping(state)
    await writeStatus()
    if (!activeChild) return
    await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
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
      if (!canStartGameStream(state)) return { status: "already-running" }
      stopRequested = false

      const runId = crypto.randomUUID()
      state = beginGameStreamStart(state, runId)

      if (!options.allowRoot && processInfo.uid === 0) {
        return fail("preflight", "refusing to run game stream as root", 126)
      }

      await writeStatus()

      const preflight = preflightSessionEnvironment({
        env: processEnv,
        gamescopeEnabled: options.gamescope?.enabled === true,
        repairEnabled: options.fullscreen !== undefined,
      })
      if (!preflight.ok) return fail("preflight", preflight.reason, 126)

      const steamBoundary = validateSteamFreeCommand(options.game)
      if (!steamBoundary.ok) {
        return fail("preflight", steamBoundary.reason, 126)
      }

      if (stopRequested) {
        return fail("cleanup", "game stream stopped before launch", 143)
      }

      let lockResult: Awaited<ReturnType<GameStreamRunLockManager["acquire"]>>
      try {
        lockResult = await lockManager.acquire()
      } catch (error) {
        return fail("lock", errorMessage(error), 125)
      }
      if (!lockResult.acquired) {
        state = failGameStream(state, {
          stage: "lock",
          reason: "game stream is already running",
          exitCode: 125,
        })
        await writeStatus()
        return { status: "already-running" }
      }

      let ignoredWindowIds: ReadonlySet<number> | undefined
      try {
        if (options.fullscreen) {
          try {
            ignoredWindowIds = await snapshotStreamSurfaceIds(
              options.fullscreen,
            )
          } catch (error) {
            return await fail("preflight", errorMessage(error), 126)
          }
        }

        if (stopRequested) {
          return await fail("cleanup", "game stream stopped before launch", 143)
        }

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

        if (stopRequested) {
          await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
          return await fail("cleanup", "game stream stopped during launch", 143)
        }

        state = markGameStreamRunning(state, activeChild.pid)
        await writeStatus()

        if (options.fullscreen) {
          try {
            await repairStreamSurface({
              ...options.fullscreen,
              ignoredWindowIds,
            })
            state = markGameStreamFullscreenRepaired(state)
            await writeStatus()
          } catch (error) {
            await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
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
        await lockResult.lock.release()
        activeChild = undefined
      }
    },
  }
}

export function createBunManagedChildSpawner(
  options: {
    readonly setsidCommand?: string
    readonly env?: NodeJS.ProcessEnv
  } = {},
): ManagedChildSpawner {
  const setsidCommand = options.setsidCommand ?? "setsid"
  return {
    async spawn(spec) {
      const env = spec.env
        ? { ...(options.env ?? process.env), ...spec.env }
        : { ...(options.env ?? process.env) }
      const proc = Bun.spawn(
        [setsidCommand, "--", spec.command, ...spec.args],
        {
          cwd: spec.cwd,
          env: env as Record<string, string>,
          stdin: "ignore",
          stdout: "inherit",
          stderr: "inherit",
        },
      )

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

export function createSwayCommandRunner(
  command = "swaymsg",
  timeoutMs = DEFAULT_SWAY_COMMAND_TIMEOUT_MS,
) {
  return {
    async run(args: readonly string[]): Promise<string> {
      const proc = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const timedOut = Symbol("timedOut")
      const timeout = new Promise<typeof timedOut>(resolve => {
        setTimeout(() => resolve(timedOut), timeoutMs)
      })
      const exit = await Promise.race([proc.exited, timeout])
      if (exit === timedOut) {
        proc.kill("SIGKILL")
        throw new Error(`swaymsg timed out after ${timeoutMs}ms`)
      }

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      if (exit !== 0) throw new Error(stderr || `swaymsg exited ${exit}`)
      return stdout
    },
  }
}

export function createFileGameStreamRunLock(
  lockPath: string,
  options: {
    readonly pid?: number
    readonly isProcessAlive?: (pid: number) => boolean
    readonly token?: string
  } = {},
): GameStreamRunLockManager {
  const pid = options.pid ?? process.pid
  const token = options.token ?? crypto.randomUUID()
  const lockContents = `${pid}:${token}\n`
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive

  return {
    async acquire() {
      await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 })
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const handle = await open(lockPath, "wx")
          await handle.writeFile(lockContents)
          await handle.close()
          return {
            acquired: true,
            lock: {
              async release() {
                await removeLockIfUnchanged(lockPath, lockContents)
              },
            },
          }
        } catch (error) {
          if (!isFileExistsError(error)) throw error
          const existing = await readExistingLock(lockPath)
          if (existing.pid !== undefined && isProcessAlive(existing.pid)) {
            return { acquired: false, reason: "already-running" }
          }
          if (!(await removeLockIfUnchanged(lockPath, existing.raw))) {
            return { acquired: false, reason: "already-running" }
          }
        }
      }
      return { acquired: false, reason: "already-running" }
    },
  }
}

export function validateSteamFreeCommand(
  spec: LaunchSpec,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const values = [spec.command, ...spec.args]
  const steamLike = values.find(value =>
    /steam|com\.valvesoftware\.Steam/i.test(value),
  )
  if (steamLike) {
    return { ok: false, reason: `Steam command is out of scope: ${steamLike}` }
  }
  const gamepadUi = values.find(value => /gamepadui|bigpicture/i.test(value))
  if (gamepadUi) {
    return {
      ok: false,
      reason: `Steam fullscreen UI is out of scope: ${gamepadUi}`,
    }
  }
  return { ok: true }
}

function preflightSessionEnvironment(input: {
  readonly env: NodeJS.ProcessEnv
  readonly gamescopeEnabled: boolean
  readonly repairEnabled: boolean
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (input.gamescopeEnabled) {
    if (!input.env.XDG_RUNTIME_DIR) {
      return { ok: false, reason: "XDG_RUNTIME_DIR is required for Gamescope" }
    }
    if (!input.env.WAYLAND_DISPLAY) {
      return { ok: false, reason: "WAYLAND_DISPLAY is required for Gamescope" }
    }
  }
  if (input.repairEnabled && !input.env.SWAYSOCK) {
    return { ok: false, reason: "SWAYSOCK is required for Sway repair" }
  }
  return { ok: true }
}

async function terminateChild(
  child: ManagedChild,
  signal: NodeJS.Signals,
  graceMs: number,
): Promise<void> {
  await child.terminate(signal)
  if (await exitsWithin(child, graceMs)) return
  await child.terminate("SIGKILL")
  await exitsWithin(child, graceMs)
}

async function exitsWithin(
  child: ManagedChild,
  durationMs: number,
): Promise<boolean> {
  const timeout = new Promise<false>(resolve => {
    setTimeout(() => resolve(false), durationMs)
  })
  const result = await Promise.race([child.exited.then(() => true), timeout])
  return result === true
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function readExistingLock(lockPath: string): Promise<{
  readonly raw: string | undefined
  readonly pid: number | undefined
}> {
  const raw = await readFile(lockPath, "utf8").catch(() => undefined)
  if (!raw) return { raw, pid: undefined }
  const parsed = Number.parseInt(raw.trim().split(":")[0] ?? "", 10)
  return { raw, pid: Number.isFinite(parsed) ? parsed : undefined }
}

async function removeLockIfUnchanged(
  lockPath: string,
  expectedRaw: string | undefined,
): Promise<boolean> {
  const currentRaw = await readFile(lockPath, "utf8").catch(() => undefined)
  if (currentRaw !== expectedRaw) return false
  try {
    await unlink(lockPath)
    return true
  } catch {
    return false
  }
}

function isFileExistsError(error: unknown): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === "EEXIST"
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function launchSpecFromEnv(env: NodeJS.ProcessEnv): LaunchSpec {
  const command = env.KORRI_GAME_STREAM_COMMAND
  if (!command) throw new Error("KORRI_GAME_STREAM_COMMAND is required")
  const args = env.KORRI_GAME_STREAM_ARGS_JSON
    ? parseArgsJson(env.KORRI_GAME_STREAM_ARGS_JSON)
    : []
  return {
    command,
    args,
    cwd: env.KORRI_GAME_STREAM_CWD,
  }
}

function parseArgsJson(raw: string): readonly string[] {
  const parsed = JSON.parse(raw) as unknown
  if (
    !Array.isArray(parsed) ||
    !parsed.every(value => typeof value === "string")
  ) {
    throw new Error(
      "KORRI_GAME_STREAM_ARGS_JSON must be a JSON array of strings",
    )
  }
  return parsed
}

if (import.meta.main) {
  const game = launchSpecFromEnv(process.env)
  const lockPath = process.env.KORRI_GAME_STREAM_LOCK_PATH ?? DEFAULT_LOCK_PATH
  const statusPath = process.env.KORRI_GAME_STREAM_STATUS_PATH
  const useGamescope = process.env.KORRI_GAME_STREAM_USE_GAMESCOPE === "1"
  const repairSway =
    process.env.KORRI_GAME_STREAM_SWAY_REPAIR !== "0" && useGamescope
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
          runner: createSwayCommandRunner(
            process.env.KORRI_GAME_STREAM_SWAYMSG,
          ),
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
