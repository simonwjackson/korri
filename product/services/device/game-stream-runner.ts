import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { xdgRuntimeDir } from "@platform/config/xdg-paths"
import { cleanupLaunchArtifacts } from "@platform/library/config/app-materializer"
import {
  decodeLaunchSpec,
  type Launcher,
  type LaunchResult,
  type LaunchSpec,
  launchEnvironment,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import { createSessionLauncherFromEnv } from "@platform/library/session-launcher"
import { logger as defaultLogger } from "@platform/logger"
import {
  composeLaunchCompanions,
  launchCompanionDiagnosticSummary,
} from "@platform/plugin/launch-companion"
import {
  createPluginRegistry,
  type PluginRegistry,
} from "@platform/plugin/registry"
import { createFirstPartyPluginRegistryFromEnv } from "@product/plugin-host"
import { Effect } from "effect"
import {
  type RepairStreamSurfaceOptions,
  repairStreamSurface,
  snapshotStreamSurfaceIds,
} from "./game-stream-fullscreen"
import {
  type ClaimedGameStreamLaunchIntent,
  createFileGameStreamLaunchIntentStore,
  createLaunchIntent,
  defaultGameStreamIntentPath,
  type GameStreamLaunchIntentStore,
} from "./game-stream-launch-intent"
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

const DEFAULT_EXEC_TRAMPOLINE_COMMAND = "sh"
const EXEC_TRAMPOLINE_SCRIPT = 'exec "$@"'

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
  readonly launchIntentStore: GameStreamLaunchIntentStore
  readonly spawner?: ManagedChildSpawner
  readonly lockManager?: GameStreamRunLockManager
  readonly pluginRegistry?: PluginRegistry
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
  /**
   * Optional sessiond client. When set, `lifecycle: "foreground"` intents
   * route through sessiond instead of the local `spawner`. Sessiond owns
   * the child supervision, Sway preflight/repair, and idle restore;
   * the runner just translates the trusted intent into a managed-launch
   * call and stays alive on the SSE stream until both `child-exited` and
   * the role's terminal readiness event have fired.
   *
   * `lifecycle: "session"` intents continue on the local spawn path even
   * when this is configured — the managed-launch protocol does not yet
   * carry launcher-anchor / wait-monitor semantics.
   */
  readonly sessiondLauncher?: Launcher
}

export interface GameStreamRunner {
  run: () => Promise<GameStreamRunResult>
  stop: () => Promise<void>
  status: () => GameStreamState
}

const FALLBACK_LOCK_PATH = "/tmp/korri-game-stream-runner.lock"
const DEFAULT_TERMINATE_GRACE_MS = 2_000
const DEFAULT_SWAY_COMMAND_TIMEOUT_MS = 2_000
const SWAYMSG_COMMAND_ENV = "KORRI_GAME_STREAM_SWAYMSG_COMMAND"

export function createGameStreamRunner(
  options: GameStreamRunnerOptions,
): GameStreamRunner {
  const logger = options.logger ?? defaultLogger
  const spawner = options.spawner ?? createBunManagedChildSpawner()
  const sessiondLauncher = options.sessiondLauncher
  const processInfo = options.processInfo ?? {
    pid: process.pid,
    uid: typeof process.getuid === "function" ? process.getuid() : undefined,
  }
  const processEnv = options.processEnv ?? process.env
  const pluginRegistry = options.pluginRegistry ?? createPluginRegistry([])
  const lockManager =
    options.lockManager ??
    createFileGameStreamRunLock(defaultGameStreamLockPath(processEnv), {
      pid: processInfo.pid,
    })
  const terminateGraceMs =
    options.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS
  let state: GameStreamState = initialGameStreamState
  let activeChild: ManagedChild | undefined
  let activeSessiondSession:
    | {
        readonly terminate: () => void
        readonly terminateNow: () => void
      }
    | undefined
  let stopRequested = false
  const stopWaiters: Array<() => void> = []

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
    while (stopWaiters.length > 0) stopWaiters.pop()?.()
    state = beginGameStreamStopping(state)
    await writeStatus()
    if (activeSessiondSession) {
      activeSessiondSession.terminate()
      return
    }
    if (!activeChild) return
    await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
  }

  async function waitForStopRequest(): Promise<void> {
    if (stopRequested) return
    await new Promise<void>(resolve => {
      stopWaiters.push(resolve)
    })
  }

  async function requeueLaunchClaim(
    launchClaim: ClaimedGameStreamLaunchIntent,
    reason: string,
  ): Promise<void> {
    try {
      await launchClaim.requeue()
    } catch (error) {
      logger.warn(
        { err: error, launchId: launchClaim.intent.id, reason },
        "game-stream-runner: launch intent requeue failed",
      )
    }
  }

  async function completeLaunchClaim(
    launchClaim: ClaimedGameStreamLaunchIntent,
  ): Promise<void> {
    try {
      await launchClaim.complete()
    } catch (error) {
      logger.warn(
        { err: error, launchId: launchClaim.intent.id },
        "game-stream-runner: launch intent completion failed",
      )
    }
  }

  async function cleanupLaunchClaimArtifacts(
    launchClaim: ClaimedGameStreamLaunchIntent,
  ): Promise<void> {
    await Effect.runPromise(
      cleanupLaunchArtifacts(launchClaim.intent.artifacts),
    )
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

  function resetForNoPendingLaunchIntent(): GameStreamRunResult {
    // A missing one-shot intent is not a new runner observation: return a
    // failure to Sunshine/Moonlight, but do not write status over the last
    // useful session result. Reset in-memory state so this runner can retry.
    state = initialGameStreamState
    return {
      status: "failed",
      stage: "preflight",
      exitCode: 125,
      message: "no pending launch intent",
    }
  }

  async function runViaSessiond(args: {
    readonly sessiondLauncher: Launcher
    readonly spec: LaunchSpec
    readonly launchClaim: ClaimedGameStreamLaunchIntent
  }): Promise<GameStreamRunResult> {
    const { launchClaim, spec } = args
    const launcher = args.sessiondLauncher
    const spawn = launcher.spawn
    if (!spawn) {
      await requeueLaunchClaim(launchClaim, "sessiond unconfigured spawn")
      return await fail("spawn", "sessiond launcher missing managed spawn", 125)
    }

    // Phase 4D / Track A. Forward the intent's lifecycle + optional
    // wait spec to sessiond via the LaunchExtras second arg shipped in
    // U2. Foreground intents pass `lifecycle: "foreground"` explicitly
    // -- daemons defaulting to foreground on absence accept the
    // redundant field; strict decoders accept it because the protocol
    // includes it as an optional literal.
    const extras: {
      lifecycle: "foreground" | "session"
      launchMetadata?: ClaimedGameStreamLaunchIntent["intent"]["launchMetadata"]
      launchCompanions?: ClaimedGameStreamLaunchIntent["intent"]["launchCompanions"]
      wait?: LaunchSpec
    } = {
      lifecycle: launchClaim.intent.lifecycle,
      ...(launchClaim.intent.launchMetadata
        ? { launchMetadata: launchClaim.intent.launchMetadata }
        : {}),
      ...(launchClaim.intent.launchCompanions
        ? { launchCompanions: launchClaim.intent.launchCompanions }
        : {}),
      ...(launchClaim.intent.wait ? { wait: launchClaim.intent.wait } : {}),
    }
    let spawned: ManagedLaunchResult
    try {
      spawned = await spawn(spec, extras)
    } catch (error) {
      await requeueLaunchClaim(launchClaim, "sessiond spawn failure")
      return await fail("spawn", errorMessage(error), 125)
    }

    if (spawned.status === "failed") {
      await requeueLaunchClaim(launchClaim, "sessiond rejected launch")
      const exitCode =
        spawned.result.status === "failed" ? spawned.result.exitCode : 125
      return await fail(
        "spawn",
        sessiondFailureMessage(spawned.result),
        exitCode,
      )
    }

    activeSessiondSession = {
      terminate: spawned.session.terminate,
      terminateNow: spawned.session.terminateNow,
    }
    const childPid = spawned.session.processId ?? 0
    state = markGameStreamRunning(state, childPid)
    // No status.json write on the sessiond branch — sessiond's role
    // writes its own status sidecar (Phase 4C U3).

    if (stopRequested) {
      spawned.session.terminate()
    }

    let launchResult: LaunchResult
    try {
      launchResult = await spawned.result
    } catch (error) {
      activeSessiondSession = undefined
      await requeueLaunchClaim(launchClaim, "sessiond observer failure")
      return await fail("spawn", errorMessage(error), 125)
    }
    activeSessiondSession = undefined

    await completeLaunchClaim(launchClaim)

    const exitCode =
      launchResult.status === "launched" ? 0 : launchResult.exitCode
    const reportedExitCode = stopRequested && exitCode === 0 ? 143 : exitCode
    state = completeGameStreamExit(state, reportedExitCode)

    await cleanupLaunchClaimArtifacts(launchClaim)

    if (stopRequested) {
      return {
        status: "failed",
        stage: "game",
        exitCode: reportedExitCode,
        message:
          launchResult.status === "failed"
            ? (launchResult.stderrTail ??
              "sessiond managed launch stopped mid-run")
            : "sessiond managed launch stopped mid-run",
      }
    }
    if (launchResult.status === "launched") {
      return { status: "launched", exitCode: 0 }
    }
    return {
      status: "failed",
      stage: "spawn",
      exitCode: launchResult.exitCode,
      message: launchResult.stderrTail ?? "sessiond managed launch failed",
    }
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
        if (stopRequested) {
          return await fail("cleanup", "game stream stopped before launch", 143)
        }

        let launchClaim: Awaited<
          ReturnType<GameStreamLaunchIntentStore["claim"]>
        >
        try {
          launchClaim = await options.launchIntentStore.claim()
        } catch (error) {
          return await fail("preflight", errorMessage(error), 126)
        }
        if (!launchClaim) {
          return resetForNoPendingLaunchIntent()
        }
        if (stopRequested) {
          await requeueLaunchClaim(launchClaim, "startup cancellation")
          return await fail("cleanup", "game stream stopped before launch", 143)
        }

        const launchCompanions = launchClaim.intent.launchCompanions ?? {}
        const companionEntries = Object.keys(launchCompanions).length

        if (stopRequested) {
          await requeueLaunchClaim(launchClaim, "startup cancellation")
          return await fail("cleanup", "game stream stopped before launch", 143)
        }

        const specResult = await Effect.runPromise(
          composeLaunchCompanions({
            spec: launchClaim.intent.launch,
            launchCompanions,
            registry: pluginRegistry,
            options: {
              launchMetadata: launchClaim.intent.launchMetadata,
              launchId: launchClaim.intent.id,
            },
          }),
        )
        if (specResult._tag === "LaunchCompanionDiagnostics") {
          await requeueLaunchClaim(launchClaim, "preflight failure")
          return await fail(
            "preflight",
            launchCompanionDiagnosticSummary(specResult.diagnostics),
            126,
          )
        }
        const spec = specResult.spec
        const fullscreen =
          companionEntries > 0 &&
          !launchSpecsEqual(spec, launchClaim.intent.launch)
            ? options.fullscreen
            : undefined
        const preflight = preflightSessionEnvironment({
          env: processEnv,
          repairEnabled: fullscreen !== undefined,
        })
        if (!preflight.ok) {
          await requeueLaunchClaim(launchClaim, "preflight failure")
          return await fail("preflight", preflight.reason, 126)
        }
        if (fullscreen) {
          try {
            ignoredWindowIds = await snapshotStreamSurfaceIds(fullscreen)
          } catch (error) {
            await requeueLaunchClaim(launchClaim, "preflight failure")
            return await fail("preflight", errorMessage(error), 126)
          }
        }

        if (stopRequested) {
          await requeueLaunchClaim(launchClaim, "startup cancellation")
          return await fail("cleanup", "game stream stopped before launch", 143)
        }

        logger.info(
          { command: spec.command, argc: spec.args.length },
          "game-stream-runner: spawning game",
        )

        if (
          sessiondLauncher !== undefined &&
          sessiondLauncher.spawn !== undefined
        ) {
          // Phase 4D / Track A U6. All lifecycle classes now go through
          // sessiond when configured -- sessiond's source-machine role
          // owns foreground promotion (U5), launcher-anchor + wait-monitor
          // dispatch (U4), and the role's terminal readiness handshake.
          // The in-process foreground / session-anchor / wait-monitor
          // branches below remain only for the sessiondLauncher === undefined
          // path (unit tests + transitional deployments).
          return await runViaSessiond({
            sessiondLauncher,
            spec,
            launchClaim,
          })
        }

        try {
          activeChild = await spawner.spawn(spec)
        } catch (error) {
          await requeueLaunchClaim(launchClaim, "spawn failure")
          return await fail("spawn", errorMessage(error), 127)
        }

        if (stopRequested) {
          await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
          await requeueLaunchClaim(launchClaim, "startup cancellation")
          return await fail("cleanup", "game stream stopped during launch", 143)
        }

        state = markGameStreamRunning(state, activeChild.pid)
        await writeStatus()

        if (fullscreen) {
          try {
            await repairStreamSurface({
              ...fullscreen,
              ignoredWindowIds,
            })
            state = markGameStreamFullscreenRepaired(state)
            await writeStatus()
          } catch (error) {
            await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
            await requeueLaunchClaim(launchClaim, "fullscreen failure")
            return await fail("fullscreen", errorMessage(error), 1)
          }
        }

        const shouldDelayIntentCompletion =
          launchClaim.intent.lifecycle === "session" && launchClaim.intent.wait
        if (!shouldDelayIntentCompletion) {
          await completeLaunchClaim(launchClaim)
        }

        let exitCode = await activeChild.exited
        activeChild = undefined
        if (
          launchClaim.intent.lifecycle === "session" &&
          exitCode === 0 &&
          !stopRequested
        ) {
          if (launchClaim.intent.wait) {
            logger.info(
              { launchId: launchClaim.intent.id },
              "game-stream-runner: launch process exited; waiting for session monitor",
            )
            try {
              activeChild = await spawner.spawn(launchClaim.intent.wait)
            } catch (error) {
              logger.warn(
                { err: error, launchId: launchClaim.intent.id },
                "game-stream-runner: session monitor spawn failed; anchoring session",
              )
              await completeLaunchClaim(launchClaim)
              await waitForStopRequest()
              state = completeGameStreamExit(state, exitCode)
              await writeStatus()
              await cleanupLaunchClaimArtifacts(launchClaim)
              return { status: "launched", exitCode: 0 }
            }
            if (stopRequested) {
              await terminateChild(activeChild, "SIGTERM", terminateGraceMs)
              await completeLaunchClaim(launchClaim)
              const result = await fail(
                "cleanup",
                "game stream stopped during launch",
                143,
              )
              await cleanupLaunchClaimArtifacts(launchClaim)
              return result
            }
            await completeLaunchClaim(launchClaim)
            state = markGameStreamRunning(state, activeChild.pid)
            await writeStatus()
            exitCode = await activeChild.exited
            activeChild = undefined
          } else {
            logger.info(
              { launchId: launchClaim.intent.id },
              "game-stream-runner: launch process exited; anchoring session",
            )
            await waitForStopRequest()
          }
        } else if (shouldDelayIntentCompletion) {
          await completeLaunchClaim(launchClaim)
        }
        // If stop was requested while a child was still being supervised,
        // classify as a stopped run regardless of how the child exited.
        // Games (especially SDL2 ones) often catch SIGTERM and exit
        // cleanly with code 0 — we still want to record this as a stop
        // (143, the SIGTERM convention), not a clean launch.
        //
        // Launcher-style session anchors (lifecycle="session" without
        // wait) are excluded: their launcher already exited cleanly
        // before stop arrived and stop just tears down the anchor, so
        // reporting "launched" is correct.
        const isLauncherAnchor =
          launchClaim.intent.lifecycle === "session" && !launchClaim.intent.wait
        const stoppedMidRun = stopRequested && !isLauncherAnchor
        const reportedExitCode =
          stoppedMidRun && exitCode === 0 ? 143 : exitCode
        state = completeGameStreamExit(state, reportedExitCode)
        await writeStatus()

        await cleanupLaunchClaimArtifacts(launchClaim)

        if (stoppedMidRun) {
          return { status: "failed", stage: "game", exitCode: reportedExitCode }
        }
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
      const env = launchEnvironment(spec, options.env ?? process.env)
      const isSetuidRemapBridge =
        spec.command === "/run/wrappers/bin/korri-remap-bridge"
      const argv = isSetuidRemapBridge
        ? [
            DEFAULT_EXEC_TRAMPOLINE_COMMAND,
            "-c",
            EXEC_TRAMPOLINE_SCRIPT,
            DEFAULT_EXEC_TRAMPOLINE_COMMAND,
            spec.command,
            ...spec.args,
          ]
        : [
            setsidCommand,
            "--",
            DEFAULT_EXEC_TRAMPOLINE_COMMAND,
            "-c",
            EXEC_TRAMPOLINE_SCRIPT,
            DEFAULT_EXEC_TRAMPOLINE_COMMAND,
            spec.command,
            ...spec.args,
          ]
      const proc = Bun.spawn(argv, {
        // Sessiond can run from a private home/cwd. Spawn managed children
        // from a world-searchable default so setuid wrappers retain their
        // intended privilege transition unless a launch explicitly provides
        // a cwd.
        cwd: spec.cwd ?? "/tmp",
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

function launchSpecsEqual(left: LaunchSpec, right: LaunchSpec): boolean {
  return (
    left.command === right.command &&
    arraysEqual(left.args, right.args) &&
    left.cwd === right.cwd &&
    recordsEqual(left.env, right.env) &&
    arraysEqual(left.envUnset, right.envUnset)
  )
}

function arraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const normalizedLeft = left ?? []
  const normalizedRight = right ?? []
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}

function recordsEqual(
  left: Readonly<Record<string, string>> | undefined,
  right: Readonly<Record<string, string>> | undefined,
): boolean {
  const normalizedLeft = left ?? {}
  const normalizedRight = right ?? {}
  const leftKeys = Object.keys(normalizedLeft).sort()
  const rightKeys = Object.keys(normalizedRight).sort()
  return (
    arraysEqual(leftKeys, rightKeys) &&
    leftKeys.every(key => normalizedLeft[key] === normalizedRight[key])
  )
}

function toolCommandFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const trimmed = env[name]?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function preflightSessionEnvironment(input: {
  readonly env: NodeJS.ProcessEnv
  readonly repairEnabled: boolean
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
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

function sessiondFailureMessage(result: LaunchResult): string {
  if (result.status === "launched") return "sessiond reported failure"
  return result.stderrTail ?? "sessiond managed launch failed"
}

function isFileExistsError(error: unknown): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === "EEXIST"
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function launchSpecFromCli(args: readonly string[]): {
  readonly launch: LaunchSpec
  readonly lifecycle: "foreground" | "session"
  readonly wait?: LaunchSpec
} {
  const separator = args.indexOf("--")
  const optionArgs = separator === -1 ? [] : args.slice(0, separator)
  const commandArgs = separator === -1 ? args : args.slice(separator + 1)
  const env: Record<string, string> = {}
  let cwd: string | undefined
  let lifecycle: "foreground" | "session" = "foreground"
  let wait: LaunchSpec | undefined

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index]
    if (arg === "--cwd") {
      cwd = optionArgs[index + 1]
      index += 1
      continue
    }
    if (arg === "--env") {
      const entry = optionArgs[index + 1]
      if (!entry?.includes("=")) throw new Error("--env requires KEY=VALUE")
      const equalsIndex = entry.indexOf("=")
      env[entry.slice(0, equalsIndex)] = entry.slice(equalsIndex + 1)
      index += 1
      continue
    }
    if (arg === "--lifecycle") {
      const value = optionArgs[index + 1]
      if (value !== "foreground" && value !== "session") {
        throw new Error("--lifecycle must be foreground or session")
      }
      lifecycle = value
      index += 1
      continue
    }
    if (arg === "--wait-json") {
      const value = optionArgs[index + 1]
      if (!value)
        throw new Error("--wait-json requires a LaunchSpec JSON value")
      wait = decodeLaunchSpec(JSON.parse(value) as unknown)
      index += 1
      continue
    }
    throw new Error(`unknown enqueue option: ${arg}`)
  }

  const [command, ...launchArgs] = commandArgs
  if (!command) throw new Error("enqueue requires a command")
  return {
    lifecycle,
    ...(wait ? { wait } : {}),
    launch: {
      command,
      args: launchArgs,
      ...(cwd ? { cwd } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    },
  }
}

export function defaultGameStreamLockPath(env: NodeJS.ProcessEnv): string {
  const runtimeDir = xdgRuntimeDir(env)
  return runtimeDir
    ? join(runtimeDir, "korri-game-stream", "run.lock")
    : FALLBACK_LOCK_PATH
}

export interface SuperviseSignalSource {
  readonly listenSignal: (signal: NodeJS.Signals, handler: () => void) => void
  readonly exit: (code: number) => void
}

/**
 * Drives a runner to completion and maps signals + result to a process
 * exit code. Extracted from the main entry so it can be unit-tested
 * without touching the real process.
 *
 * On SIGTERM / SIGINT the supervisor calls runner.stop() and exits with
 * 143 / 130 respectively as soon as stop() resolves, without waiting for
 * runner.run() to fall through naturally. This prevents the runner from
 * outliving its terminated child if run() is held up for any reason.
 */
export async function superviseGameStreamRunner(
  runner: {
    readonly run: () => Promise<GameStreamRunResult>
    readonly stop: () => Promise<void>
  },
  source: SuperviseSignalSource,
): Promise<void> {
  let exited = false
  const requestExit = (code: number) => {
    if (exited) return
    exited = true
    source.exit(code)
  }

  const handleSignal = (code: number) => () => {
    if (exited) return
    runner.stop().finally(() => requestExit(code))
  }

  source.listenSignal("SIGTERM", handleSignal(143))
  source.listenSignal("SIGINT", handleSignal(130))

  const result = await runner.run()
  if (exited) return
  if (result.status === "launched") {
    requestExit(0)
    return
  }
  if (result.status === "already-running") {
    requestExit(125)
    return
  }
  requestExit(result.exitCode)
}

if (import.meta.main) {
  const lockPath =
    process.env.KORRI_GAME_STREAM_LOCK_PATH ??
    defaultGameStreamLockPath(process.env)
  const intentPath = defaultGameStreamIntentPath(process.env)
  const statusPath = process.env.KORRI_GAME_STREAM_STATUS_PATH
  if (Bun.argv[2] === "enqueue") {
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const { launch, lifecycle, wait } = launchSpecFromCli(Bun.argv.slice(3))
    await store.enqueue(createLaunchIntent(launch, { lifecycle, wait }))
    process.exit(0)
  }

  const sessiondLauncher = createSessionLauncherFromEnv(process.env)

  const runner = createGameStreamRunner({
    launchIntentStore: createFileGameStreamLaunchIntentStore(intentPath),
    statusPath,
    lockManager: createFileGameStreamRunLock(lockPath),
    pluginRegistry: createFirstPartyPluginRegistryFromEnv(process.env),
    fullscreen: {
      runner: createSwayCommandRunner(
        toolCommandFromEnv(process.env, SWAYMSG_COMMAND_ENV, "swaymsg"),
      ),
      selector: {},
    },
    ...(sessiondLauncher ? { sessiondLauncher } : {}),
  })

  await superviseGameStreamRunner(runner, {
    listenSignal: (signal, handler) => {
      process.once(signal, handler)
    },
    exit: code => process.exit(code),
  })
}
