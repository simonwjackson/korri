import { access, unlink } from "node:fs/promises"
import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import type { ResolvedLaunchHooks } from "@platform/library/config/resolved-launch-context"
import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import { projectManagedLaunchStatus } from "@platform/library/sessiond-lifecycle-projections"
import {
  decodeSessiondManagedLaunchFreezeRequest,
  decodeSessiondManagedLaunchInputSeatLeaveRequest,
  decodeSessiondManagedLaunchStartRequest,
  decodeSessiondManagedLaunchTerminateRequest,
  decodeSessiondManagedLaunchThawRequest,
  type SessiondManagedLaunchEvent,
  type SessiondManagedLaunchFreezeResponse,
  type SessiondManagedLaunchInputSeatLeaveRequest,
  type SessiondManagedLaunchInputSeatLeaveResponse,
  type SessiondManagedLaunchInputSeatSummary,
  type SessiondManagedLaunchStartResponse,
  type SessiondManagedLaunchStatus,
  type SessiondManagedLaunchTerminateResponse,
  type SessiondManagedLaunchThawResponse,
} from "@platform/library/sessiond-managed-launch-protocol"
import { createShellLauncher } from "@platform/library/shell-launcher"
import { logger as defaultLogger } from "@platform/logger"
import {
  decodeLaunchMetadata,
  type LaunchMetadata,
} from "@platform/plugin/launch-metadata"
import type {
  KorriSessionLifecycleHook as KorriSessiondLifecycleHook,
  KorriSessionLifecycleHookCleanupRequest as KorriSessiondLifecycleHookCleanupRequest,
  KorriSessionLifecycleHookCleanupResult as KorriSessiondLifecycleHookCleanupResult,
  KorriSessionLifecycleHookHandle as KorriSessiondLifecycleHookHandle,
  KorriSessionLifecycleHookStartRequest as KorriSessiondLifecycleHookStartRequest,
} from "@platform/plugin/session-lifecycle"
import {
  findStreamSurfaceWindows,
  isTransientMissingSurfaceCommandError,
  repairStreamSurface,
} from "./game-stream-fullscreen"
import {
  createChromiumController,
  realChromiumRunner,
} from "./sessiond-chromium"
import { createKorriLaneController } from "./sessiond-lanes"
import {
  createLaunchHooksRunner,
  type LaunchHookOutcome,
  type LaunchHooksRunner,
} from "./sessiond-launch-hooks"
import {
  sessiondPreSpawnGatesFromEnv,
  sessionLifecycleHooksFromEnv,
} from "./sessiond-plugin-composition"
import {
  KorriSessiondPreSpawnFailure,
  type KorriSessiondPreSpawnGate,
  type KorriSessiondPreSpawnGateHandle,
} from "./sessiond-pre-spawn"
import type {
  KorriRendererController,
  KorriRendererStatus,
} from "./sessiond-renderer"
import {
  createKioskSessionRole,
  createLaneAwareKioskSessionRole,
  formatSessionRoleReadyEvidence,
  type SessionRole,
  sessionRoleReadyOutcome,
} from "./sessiond-role"
import type { SourceMachineSwayController } from "./sessiond-source-machine"
import { createSourceMachineSessionRole } from "./sessiond-source-machine"
import {
  beginKorriLaunch,
  beginKorriRestore,
  completeKorriRestore,
  failKorriRestore,
  initialKorriSessionState,
  type KorriSessionMode,
  type KorriSessionState,
  korriSessionActiveLaunch,
  markKorriGameRunning,
  markKorriHome,
  noteKorriRestoreAttemptFailure,
  shouldStopAfterRestoreFailure,
  startKorriSession,
  stopKorriSession,
} from "./sessiond-state"
import {
  createStatusSidecar,
  type StatusSidecar,
} from "./sessiond-status-sidecar"
import {
  createSwayController,
  type SwayCommandRunner,
  type SwayController,
  type SwayWindowSelector,
} from "./sessiond-sway"
import { createSessiondSwayEventSource } from "./sessiond-sway-events"
import {
  createSwayLaneEventSupervisor,
  type SwayLaneEventSupervisor,
} from "./sessiond-sway-lane-supervisor"
import {
  discoverSwaySocketEnv,
  discoverSwaySocketPath,
} from "./sessiond-sway-socket"
import type { SunshineStreamWatcher } from "./sunshine-stream-watcher"
import { startSunshineStreamWatcherFromEnv } from "./sunshine-stream-watcher-live"

export interface KorriSessiondLogger {
  debug: (input: unknown, message?: string) => void
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface KorriSessiondServiceManager {
  maskEssway: () => Promise<void>
  restoreEssway: () => Promise<void>
}

export interface KorriSessiondLauncher {
  run: (spec: LaunchSpec) => Promise<LaunchResult>
  spawn?: (spec: LaunchSpec) => Promise<ManagedLaunchResult>
}

export type {
  KorriSessiondPreSpawnGate,
  KorriSessiondPreSpawnGateHandle,
  KorriSessiondPreSpawnGateRequest,
} from "./sessiond-pre-spawn"
export { KorriSessiondPreSpawnFailure } from "./sessiond-pre-spawn"

export type {
  KorriSessiondLifecycleHook,
  KorriSessiondLifecycleHookCleanupRequest,
  KorriSessiondLifecycleHookCleanupResult,
  KorriSessiondLifecycleHookHandle,
  KorriSessiondLifecycleHookStartRequest,
}

export interface KorriSessiondOptions {
  readonly port?: number
  readonly hostname?: string
  readonly socketPath?: string
  /**
   * Role-pluggable supervisor adapter. When omitted, a kiosk role is
   * composed from `renderer`, `sway`, and `serviceManager` for back-compat.
   */
  readonly role?: SessionRole
  readonly renderer?: KorriRendererController
  readonly sway?: SwayController
  readonly serviceManager?: KorriSessiondServiceManager
  readonly launcher?: KorriSessiondLauncher
  /**
   * Optional plugin/session lifecycle hooks. Sessiond owns foreground
   * lifecycle and invokes these only at bounded launch/cleanup phases.
   */
  readonly sessionHooks?: readonly KorriSessiondLifecycleHook[]
  /** Focused pre-spawn readiness gates. Input-seat uses this to block spawn until seats are ready. */
  readonly preSpawnGates?: readonly KorriSessiondPreSpawnGate[]
  /**
   * Back-compat `status.json` sidecar (source-machine role only). When
   * configured, sessiond writes a runner-shaped JSON snapshot on every
   * state transition so operator tooling that polls
   * `KORRI_GAME_STREAM_STATUS_PATH` keeps working. Kiosk-role hosts do
   * not configure this.
   */
  readonly statusSidecar?: StatusSidecar
  /**
   * Interval at which `/managed-launch/events` SSE streams emit
   * heartbeat comments (`: hb`). Keeps the HTTP connection alive across
   * idle-timeout windows so an observer never misreads a quiet but
   * healthy launch as a failure. Default: 5 seconds.
   */
  readonly heartbeatIntervalMs?: number
  /** Grace window after graceful managed-launch termination before force escalation. */
  readonly managedStopGraceMs?: number
  /** Delay between idle-restore retries after a managed launch. Default 1s. */
  readonly restoreRetryDelayMs?: number
  /**
   * Filesystem marker owned by the fake-suspend controller. When present,
   * sessiond rejects new launches before spawning so remote/agent entrypoints
   * cannot start foreground work while the display/session is suspended.
   */
  readonly fakeSuspendActiveMarkerPath?: string
  readonly logger?: KorriSessiondLogger
}

export interface KorriSessiondHandle {
  readonly port?: number
  readonly hostname?: string
  readonly socketPath?: string
  status: () => KorriSessiondStatus
  stop: () => Promise<void>
}

export interface KorriSessiondStatus {
  readonly state: KorriSessionState
  readonly renderer: KorriRendererStatus
}

export interface KorriSessiondCore {
  status: () => KorriSessiondStatus
  handleRequest: (request: Request) => Promise<Response>
}

const DEFAULT_PORT = 3003
const DEFAULT_HOSTNAME = "127.0.0.1"
// Spaced ~1s so MAX_RESTORE_ATTEMPTS spans several seconds of retries -- long
// enough for sway and the renderer to recover after a crashed nested launch
// before sessiond gives up (self-heal back to home instead of a stranded black
// screen).
const RESTORE_RETRY_DELAY_MS = 1000
const DEFAULT_MANAGED_STOP_GRACE_MS = 1500
const KORRI_REMAP_PLUGIN_ID = "@korri:remap"
const KORRI_REMAP_DIRTY_CLEANUP_EXIT_CODE = 120

export function createKorriSessiondCore(
  options: Omit<KorriSessiondOptions, "port" | "hostname">,
): KorriSessiondCore {
  const logger = options.logger ?? defaultLogger
  const renderer = options.renderer ?? realRendererController()
  const sway = options.sway ?? realSwayController()
  const serviceManager = options.serviceManager ?? realServiceManager()
  const launcher =
    options.launcher ?? createShellLauncher({ processGroup: true })
  const role: SessionRole =
    options.role ?? createKioskSessionRole({ renderer, sway, serviceManager })
  const sessionHooks = options.sessionHooks ?? []
  const preSpawnGates = options.preSpawnGates ?? []
  const statusSidecar = options.statusSidecar
  let state: KorriSessionState = initialKorriSessionState
  let eventSequence = 0
  const lifecycleEvents: SessiondManagedLaunchEvent[] = []
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000
  const managedStopGraceMs =
    options.managedStopGraceMs ?? DEFAULT_MANAGED_STOP_GRACE_MS
  const restoreRetryDelayMs =
    options.restoreRetryDelayMs ?? RESTORE_RETRY_DELAY_MS
  const fakeSuspendActiveMarkerPath =
    options.fakeSuspendActiveMarkerPath ??
    process.env.KORRI_FAKESUSPEND_ACTIVE_MARKER
  const heartbeatPayload = new TextEncoder().encode(": hb\n\n")
  const lifecycleSubscribers = new Set<{
    readonly launchId: string
    readonly controller: ReadableStreamDefaultController<Uint8Array>
    readonly heartbeat: ReturnType<typeof setInterval>
  }>()
  let activeManagedLaunch:
    | {
        readonly launchId: string
        cancelRequested?: "graceful" | "force"
        terminate?: () => void
        terminateNow?: () => void
        freeze?: () => void
        thaw?: () => void
        frozen?: boolean
        preFreezePhase?:
          | "launching"
          | "running"
          | "wait-monitor"
          | "anchored"
          | "restoring"
        processGroupId?: number
        // Phase 4D / Track A. Set while sessiond is in the session-
        // anchored state (no live child, waiting for an external
        // terminate). terminateManagedLaunchById calls this to wake
        // the dispatcher; resetting falls back to terminate/terminateNow.
        cancelAnchor?: () => void
        cancelWaiter?: () => void
        launchMetadata?: LaunchMetadata
        sessionHookHandles?: readonly KorriSessiondLifecycleHookHandle[]
        preSpawnAbortController?: AbortController
        hooksRunner?: LaunchHooksRunner
        preSpawnGateHandles?: readonly KorriSessiondPreSpawnGateHandle[]
        inputSeats?: SessiondManagedLaunchInputSeatSummary
      }
    | undefined
  // Phase 4D / Track A finishing follow-up. Tracks the current
  // session sub-phase for /managed-launch/status responses. Cleared
  // when the active managed launch is cleared (sessiond is back to
  // home / idle / recovering, no active payload to attach phase to).
  let currentPhase:
    | "launching"
    | "running"
    | "wait-monitor"
    | "anchored"
    | "frozen"
    | "restoring"
    | undefined

  function status(): KorriSessiondStatus {
    return {
      state,
      renderer: role.rendererStatus(),
    }
  }

  function emitStatusSidecar(
    phase?:
      | "launching"
      | "running"
      | "wait-monitor"
      | "anchored"
      | "frozen"
      | "restoring",
  ): void {
    // Phase 4D / Track A finishing follow-up. Each transition that
    // writes the sidecar also updates `currentPhase` so
    // /managed-launch/status surfaces the same value without a
    // second source-of-truth. Sidecar-less hosts (kiosk default)
    // still benefit because managedStatus() reads currentPhase
    // independently.
    if (phase) currentPhase = phase
    if (!statusSidecar) return
    void statusSidecar.write({
      mode: state.mode,
      ...(state.launchId ? { launchId: state.launchId } : {}),
      ...(state.failureReason ? { failureReason: state.failureReason } : {}),
      ...(phase ? { phase } : {}),
    })
  }

  function activeLaunchForManagedStatus():
    | {
        readonly launchId: string
        readonly mode: KorriSessionMode
        readonly launchMetadata?: LaunchMetadata
      }
    | undefined {
    const active = korriSessionActiveLaunch(state)
    if (!active) return undefined
    const inputSeats = activeInputSeats()
    return {
      ...active,
      ...(activeManagedLaunch?.launchMetadata
        ? { launchMetadata: activeManagedLaunch.launchMetadata }
        : {}),
      ...(inputSeats ? { inputSeats } : {}),
    }
  }

  function activeInputSeats():
    | SessiondManagedLaunchInputSeatSummary
    | undefined {
    return (
      activeManagedLaunch?.inputSeats ??
      activeManagedLaunch?.preSpawnGateHandles?.find(
        handle => handle.inputSeats !== undefined,
      )?.inputSeats
    )
  }

  function managedStatus(): SessiondManagedLaunchStatus {
    return projectManagedLaunchStatus({
      mode: state.mode,
      idleModeLabel: role.idleModeLabel,
      active: activeLaunchForManagedStatus(),
      ...(currentPhase ? { phase: currentPhase } : {}),
      ...(state.failureReason ? { failureReason: state.failureReason } : {}),
      restoreAttempts: state.restoreAttempts,
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: typeof launcher.spawn === "function",
        launchFreeze: typeof launcher.spawn === "function",
        // Launch hooks: the daemon accepts a resolved `hooks` payload on the
        // start request and executes before/after hooks around the child.
        launchHooks: true,
        // Phase 4D / Track A. Sessiond now understands
        // lifecycle: "session" start requests and emits
        // launcher-exited / wait-monitor-{running,exited} /
        // session-anchored peers. Phase 4B clients omitting the
        // field still negotiate to foreground correctly.
        sessionLifecycle: true,
        inputSeats: true,
        ...(role.toggleHome && (role.homeToggleAvailable?.() ?? true)
          ? { laneToggle: true }
          : {}),
      },
    })
  }

  function pushHookFailureEvents(
    launchId: string,
    outcomes: readonly LaunchHookOutcome[],
  ) {
    for (const outcome of outcomes) {
      if (outcome.status === "ok" || outcome.status === "aborted") continue
      pushLifecycleEvent(launchId, {
        type: "hook-failed",
        hook: { name: outcome.name, phase: outcome.phase },
        ...(outcome.stderrTail ? { message: outcome.stderrTail } : {}),
      })
    }
  }

  function pushLifecycleEvent(
    launchId: string,
    input: Omit<
      SessiondManagedLaunchEvent,
      "schemaVersion" | "sequence" | "launchId" | "at"
    >,
  ) {
    const event: SessiondManagedLaunchEvent = {
      schemaVersion: 1,
      sequence: ++eventSequence,
      launchId,
      at: new Date().toISOString(),
      ...input,
    }
    lifecycleEvents.push(event)
    if (lifecycleEvents.length > 64)
      lifecycleEvents.splice(0, lifecycleEvents.length - 64)

    const encoded = sseData(event)
    for (const subscriber of lifecycleSubscribers) {
      if (subscriber.launchId === launchId)
        subscriber.controller.enqueue(encoded)
    }

    if (isTerminalLifecycleEvent(event)) closeLifecycleSubscribers(launchId)
  }

  function closeLifecycleSubscribers(launchId: string) {
    for (const subscriber of Array.from(lifecycleSubscribers)) {
      if (subscriber.launchId !== launchId) continue
      lifecycleSubscribers.delete(subscriber)
      clearInterval(subscriber.heartbeat)
      subscriber.controller.close()
    }
  }

  async function enterHome() {
    state = startKorriSession(state)
    emitStatusSidecar()
    await role.enterIdle()
    state = markKorriHome(state)
    emitStatusSidecar()
  }

  async function leaveKorri() {
    state = stopKorriSession()
    emitStatusSidecar()
    await role.leaveIdle()
  }

  async function reconcileHome() {
    await role.reconcileIdle()
  }

  async function isFakeSuspendActive(): Promise<boolean> {
    if (!fakeSuspendActiveMarkerPath) return false
    try {
      await access(fakeSuspendActiveMarkerPath)
      return true
    } catch {
      return false
    }
  }

  async function startManagedLaunch(
    spec: LaunchSpec,
    requestedLaunchId?: string,
    lifecycleOptions: {
      readonly lifecycle?: "foreground" | "session"
      readonly launchMetadata?: LaunchMetadata
      readonly launchCompanions?: LaunchCompanionMap
      readonly wait?: LaunchSpec
      readonly hooks?: ResolvedLaunchHooks
    } = {},
  ): Promise<{
    readonly response: SessiondManagedLaunchStartResponse
    readonly result?: Promise<LaunchResult>
  }> {
    if (await isFakeSuspendActive()) {
      return {
        response: {
          status: "failed",
          failureKind: "fake-suspend-active",
          message: "fake suspend is active; launch requires resume",
        },
      }
    }

    if (state.mode !== "home") {
      return {
        response: {
          status: "failed",
          failureKind: "session-busy",
          message: `sessiond is ${state.mode}; launch requires home`,
        },
      }
    }

    const launchId = requestedLaunchId ?? crypto.randomUUID()
    state = beginKorriLaunch(state, launchId)
    emitStatusSidecar("launching")
    activeManagedLaunch = {
      launchId,
      ...(lifecycleOptions.launchMetadata
        ? { launchMetadata: lifecycleOptions.launchMetadata }
        : {}),
    }
    pushLifecycleEvent(launchId, { type: "launch-accepted" })

    const result = runManagedLaunch(launchId, spec, lifecycleOptions)
    void result.finally(() => {
      if (activeManagedLaunch?.launchId === launchId) {
        activeManagedLaunch = undefined
        // Phase 4D / Track A finishing follow-up. Clear the sub-phase
        // once the active launch is gone so /managed-launch/status
        // does not leak a stale phase into the next launch slot.
        currentPhase = undefined
      }
    })

    return { response: { status: "accepted", launchId }, result }
  }

  async function stopPreSpawnGateHandles(
    handles: readonly KorriSessiondPreSpawnGateHandle[],
  ): Promise<void> {
    for (const handle of handles) {
      try {
        await handle.stop()
      } catch (error) {
        logger.warn({ err: error }, "sessiond: pre-spawn gate stop failed")
      }
    }
  }

  async function startPreSpawnGatesForLaunch(
    launchId: string,
    spec: LaunchSpec,
    launchMetadata: LaunchMetadata | undefined,
    launchCompanions: LaunchCompanionMap | undefined,
    active:
      | {
          readonly launchId: string
          preSpawnAbortController?: AbortController
          preSpawnGateHandles?: readonly KorriSessiondPreSpawnGateHandle[]
          inputSeats?: SessiondManagedLaunchInputSeatSummary
        }
      | undefined,
  ): Promise<LaunchResult | undefined> {
    if (preSpawnGates.length === 0) return undefined
    const abortController = new AbortController()
    if (active?.launchId === launchId) {
      active.preSpawnAbortController = abortController
    }
    const handles: KorriSessiondPreSpawnGateHandle[] = []
    for (const gate of preSpawnGates) {
      try {
        const handle = await gate.start({
          launchId,
          spec,
          signal: abortController.signal,
          ...(launchMetadata ? { launchMetadata } : {}),
          ...(launchCompanions ? { launchCompanions } : {}),
        })
        if (handle) handles.push(handle)
      } catch (error) {
        await stopPreSpawnGateHandles(handles)
        const message = error instanceof Error ? error.message : String(error)
        const failureKind =
          error instanceof KorriSessiondPreSpawnFailure
            ? error.failureKind
            : "host-unavailable"
        logger.warn(
          { err: error, gateId: gate.id, failureKind },
          "sessiond: pre-spawn gate failed",
        )
        return {
          status: "failed",
          exitCode: launchFailureExitCode(failureKind),
          failureKind,
          stderrTail: message,
        }
      }
    }
    if (active?.launchId === launchId && handles.length > 0) {
      active.preSpawnGateHandles = handles
      active.inputSeats = handles.find(handle => handle.inputSeats)?.inputSeats
    }
    return undefined
  }

  async function startLifecycleHooksForLaunch(
    launchId: string,
    spec: LaunchSpec,
    launchMetadata: LaunchMetadata | undefined,
    launchCompanions: LaunchCompanionMap | undefined,
    active:
      | {
          readonly launchId: string
          readonly terminate?: () => void
          sessionHookHandles?: readonly KorriSessiondLifecycleHookHandle[]
        }
      | undefined,
  ): Promise<LaunchResult | undefined> {
    const handles: KorriSessiondLifecycleHookHandle[] = []
    for (const hook of sessionHooks) {
      if (!hook.afterChildRunning) continue
      try {
        const handle = await hook.afterChildRunning({
          launchId,
          spec,
          ...(launchMetadata ? { launchMetadata } : {}),
          ...(launchCompanions ? { launchCompanions } : {}),
          ...(active?.terminate ? { terminateLaunch: active.terminate } : {}),
        })
        if (handle) handles.push(handle)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn(
          { err: error, hookId: hook.id },
          "sessiond: lifecycle hook failed after child start",
        )
        if (hook.failurePolicy === "fail-launch") {
          await stopLifecycleHookHandles(handles)
          return {
            status: "failed",
            exitCode: launchFailureExitCode("host-unavailable"),
            failureKind: "host-unavailable",
            stderrTail: `Session lifecycle hook failed: ${message}`,
          }
        }
      }
    }
    if (active?.launchId === launchId && handles.length > 0) {
      active.sessionHookHandles = handles
    }
    return undefined
  }

  async function runManagedLaunch(
    launchId: string,
    spec: LaunchSpec,
    lifecycleOptions: {
      readonly lifecycle?: "foreground" | "session"
      readonly launchMetadata?: LaunchMetadata
      readonly launchCompanions?: LaunchCompanionMap
      readonly wait?: LaunchSpec
      readonly hooks?: ResolvedLaunchHooks
    } = {},
  ): Promise<LaunchResult> {
    const lifecycle = lifecycleOptions.lifecycle ?? "foreground"
    const wait = lifecycleOptions.wait
    const launchMetadata = lifecycleOptions.launchMetadata
    const launchCompanions = lifecycleOptions.launchCompanions
    const hooks = lifecycleOptions.hooks
    const hookGameId = gameIdFromLaunchMetadata(launchMetadata)
    const makeHooksRunner = () =>
      createLaunchHooksRunner({
        launchId,
        ...(hookGameId !== undefined ? { gameId: hookGameId } : {}),
        ...(spec.env ? { launchEnv: spec.env } : {}),
        logger,
      })
    let result: LaunchResult | undefined

    try {
      await role.beforeChildLaunch()
      result = await startPreSpawnGatesForLaunch(
        launchId,
        spec,
        launchMetadata,
        launchCompanions,
        activeManagedLaunch,
      )
      if (!result && hooks && hooks.before.length > 0) {
        // Before-hooks run after the role prepared the environment and all
        // pre-spawn gates passed, immediately before spawn. An aborting
        // failure follows the structured pre-spawn failure path: result is
        // set, spawn is skipped, after-hooks still run in teardown.
        const hooksRunner = makeHooksRunner()
        if (activeManagedLaunch?.launchId === launchId) {
          activeManagedLaunch.hooksRunner = hooksRunner
        }
        const beforeResult = await hooksRunner.runBeforeHooks(hooks.before)
        pushHookFailureEvents(launchId, beforeResult.outcomes)
        if (beforeResult.aborted) {
          result =
            beforeResult.aborted.status === "aborted"
              ? {
                  status: "failed",
                  exitCode: 130,
                  stderrTail: `launch terminated during before-hook ${beforeResult.aborted.name}`,
                }
              : {
                  status: "failed",
                  exitCode: launchFailureExitCode("hook-failed"),
                  failureKind: "hook-failed",
                  stderrTail: `launch hook ${beforeResult.aborted.name} ${beforeResult.aborted.status}${
                    beforeResult.aborted.stderrTail
                      ? `: ${beforeResult.aborted.stderrTail}`
                      : ""
                  }`,
                }
        }
      }
      if (result) {
        // Skip spawn; a readiness gate or before-hook already produced a
        // launch failure.
      } else {
        if (role.emitsRendererStopped) {
          pushLifecycleEvent(launchId, { type: "renderer-stopped" })
        }
        state = markKorriGameRunning(state)
        emitStatusSidecar("running")

        const spawn = launcher.spawn
        if (spawn) {
          const spawned = await spawn(spec)
          if (spawned.status === "failed") {
            result = spawned.result
          } else {
            const active = activeManagedLaunch
            if (active?.launchId === launchId) {
              active.terminate = spawned.session.terminate
              active.terminateNow = spawned.session.terminateNow
              active.freeze = spawned.session.freeze
              active.thaw = spawned.session.thaw
              if (spawned.session.processGroupId !== undefined) {
                active.processGroupId = spawned.session.processGroupId
              }
              if (active.cancelRequested === "force") {
                spawned.session.terminateNow()
              } else if (active.cancelRequested === "graceful") {
                spawned.session.terminate()
              }
            }
            pushLifecycleEvent(launchId, { type: "child-running" })
            if (!result) {
              result = await startLifecycleHooksForLaunch(
                launchId,
                spec,
                launchMetadata,
                launchCompanions,
                active,
              )
              if (result) {
                try {
                  spawned.session.terminate()
                } catch {
                  // Best-effort; ignore.
                }
              }
            }
            if (!result) {
              // Phase 4D / Track A. Role-specific foreground promotion
              // runs after the primary child is observed running. Throwing
              // here turns into a launch failure (host-unavailable).
              try {
                await role.afterChildRunning(spec)
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error)
                logger.warn(
                  { err: error },
                  "sessiond: afterChildRunning failed",
                )
                // Attempt to terminate the still-running child so we do not
                // leave it dangling while restoring.
                try {
                  spawned.session.terminate()
                } catch {
                  // Best-effort; ignore.
                }
                result = {
                  status: "failed",
                  exitCode: launchFailureExitCode("host-unavailable"),
                  failureKind: "host-unavailable",
                  stderrTail: message,
                }
              }
            }
            if (!result) {
              result = await waitForSpawnedLaunchResult(launchId, spawned)
            }
          }
        } else {
          pushLifecycleEvent(launchId, { type: "child-running" })
          try {
            await role.afterChildRunning(spec)
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            logger.warn({ err: error }, "sessiond: afterChildRunning failed")
            result = {
              status: "failed",
              exitCode: launchFailureExitCode("host-unavailable"),
              failureKind: "host-unavailable",
              stderrTail: message,
            }
          }
          if (!result) {
            result = await launcher.run(spec)
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result = {
        status: "failed",
        exitCode: launchFailureExitCode("host-unavailable"),
        failureKind: "host-unavailable",
        stderrTail: message,
      }
      logger.warn({ err: error }, "sessiond: managed launch failed")
    }

    // Phase 4D / Track A. Branch on lifecycle once we have the
    // primary child's result. The session lifecycle only fires when
    // the launcher exited cleanly (no cancel in flight); any other
    // outcome falls through to the original child-exited terminal.
    const cancelInFlight =
      activeManagedLaunch?.launchId === launchId &&
      activeManagedLaunch.cancelRequested !== undefined
    if (
      lifecycle === "session" &&
      result.status === "launched" &&
      !cancelInFlight
    ) {
      pushLifecycleEvent(launchId, {
        type: "launcher-exited",
        terminal: terminalFromLaunchResult(result),
      })
      if (wait) {
        const sessionResult = await runSessionWaitMonitor(launchId, wait)
        if (sessionResult.status === "degraded-to-anchor") {
          await runSessionAnchor(launchId)
        } else {
          result = sessionResult.result
        }
      } else {
        await runSessionAnchor(launchId)
      }
    } else {
      pushLifecycleEvent(launchId, {
        type: "child-exited",
        terminal: terminalFromLaunchResult(result),
      })
    }

    state = beginKorriRestore(state)
    emitStatusSidecar("restoring")
    pushLifecycleEvent(launchId, { type: "restoring" })
    const activeForRestore =
      activeManagedLaunch?.launchId === launchId
        ? activeManagedLaunch
        : undefined
    const pgid = activeForRestore?.processGroupId
    await stopLifecycleHookHandles(activeForRestore?.sessionHookHandles ?? [])
    await stopPreSpawnGateHandles(activeForRestore?.preSpawnGateHandles ?? [])
    await cleanupLifecycleHooks(
      launchId,
      pgid,
      launchMetadata,
      launchCompanions,
    )

    if (hooks && hooks.after.length > 0) {
      // After-hooks always run when the request carried hooks — including
      // before-hook abort, spawn failure, crash, and user stop — because
      // hooks mutate device state (clocks, display) that must be undone.
      // The runner reverses the inheritance-ordered list and never throws.
      const hooksRunner = activeForRestore?.hooksRunner ?? makeHooksRunner()
      const afterOutcomes = await hooksRunner.runAfterHooks(hooks.after)
      pushHookFailureEvents(launchId, afterOutcomes)
    }

    if (isRemapDirtyCleanupResult(result, launchCompanions)) {
      const message =
        "Remap cleanup verification failed; refusing to restore idle UI"
      state = failKorriRestore(state, message)
      emitStatusSidecar()
      pushLifecycleEvent(launchId, {
        type: "recovering",
        message,
        readiness: { status: "failed", message },
      })
      await leaveKorri()
      return result
    }

    while (true) {
      try {
        await role.restoreIdleAfterLaunch()
        state = completeKorriRestore(state)
        emitStatusSidecar()
        const readiness = sessionRoleReadyOutcome(role)
        pushLifecycleEvent(launchId, {
          type: role.idleReadyEventName,
          readiness: {
            status: readiness.status,
            ...(readiness.status === "ok"
              ? {
                  evidence: formatSessionRoleReadyEvidence(readiness.evidence),
                }
              : {
                  message: readiness.message,
                  ...(readiness.evidence
                    ? {
                        evidence: formatSessionRoleReadyEvidence(
                          readiness.evidence,
                        ),
                      }
                    : {}),
                }),
          },
        })
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const failedState = failKorriRestore(state, message)
        logger.warn(
          { err: error, restoreAttempts: failedState.restoreAttempts },
          "sessiond: failed to restore role idle",
        )
        if (shouldStopAfterRestoreFailure(failedState)) {
          state = failedState
          emitStatusSidecar()
          pushLifecycleEvent(launchId, {
            type: "recovering",
            message,
            readiness: { status: "failed", message },
          })
          await leaveKorri()
          break
        }

        state = beginKorriRestore(
          noteKorriRestoreAttemptFailure(state, message),
        )
        emitStatusSidecar("restoring")
        await delay(restoreRetryDelayMs)
      }
    }

    return result
  }

  async function stopLifecycleHookHandles(
    handles: readonly KorriSessiondLifecycleHookHandle[],
  ): Promise<void> {
    for (const handle of handles) {
      if (!handle.stopBeforeCleanup) continue
      try {
        await handle.stopBeforeCleanup()
      } catch (error) {
        logger.warn(
          { err: error, resource: handle.resource, label: handle.label },
          "sessiond: lifecycle hook handle threw during cleanup",
        )
      }
    }
  }

  async function cleanupLifecycleHooks(
    launchId: string,
    processGroupId: number | undefined,
    launchMetadata: LaunchMetadata | undefined,
    launchCompanions: LaunchCompanionMap | undefined,
  ): Promise<void> {
    for (const hook of sessionHooks) {
      if (!hook.cleanup) continue
      try {
        const outcome = await hook.cleanup({
          launchId,
          processGroupId,
          ...(launchMetadata ? { launchMetadata } : {}),
          ...(launchCompanions ? { launchCompanions } : {}),
        })
        if (outcome?.residual && outcome.residual.length > 0) {
          logger.warn(
            {
              hookId: hook.id,
              processGroupId,
              residualPids: outcome.residual,
            },
            "sessiond: lifecycle hook residuals remain after cleanup",
          )
        }
      } catch (error) {
        logger.warn(
          { err: error, hookId: hook.id, processGroupId },
          "sessiond: lifecycle hook cleanup threw during restore",
        )
      }
    }
  }

  async function waitForSpawnedLaunchResult(
    launchId: string,
    spawned: Extract<
      Awaited<ReturnType<NonNullable<KorriSessiondLauncher["spawn"]>>>,
      { status: "started" }
    >,
  ): Promise<LaunchResult> {
    const active =
      activeManagedLaunch?.launchId === launchId
        ? activeManagedLaunch
        : undefined

    if (!active || active.cancelRequested !== undefined) {
      return await waitForSpawnedResultAfterCancel(spawned)
    }

    let clearWaiter = false
    const cancel = new Promise<"cancelled">(resolve => {
      active.cancelWaiter = () => resolve("cancelled")
      clearWaiter = true
    })
    const completed = spawned.result.then(result => ({
      status: "completed" as const,
      result,
    }))
    const winner = await Promise.race([completed, cancel])
    if (clearWaiter && active.cancelWaiter) active.cancelWaiter = undefined
    if (winner !== "cancelled") return winner.result
    return await waitForSpawnedResultAfterCancel(spawned)
  }

  async function waitForSpawnedResultAfterCancel(
    spawned: Extract<
      Awaited<ReturnType<NonNullable<KorriSessiondLauncher["spawn"]>>>,
      { status: "started" }
    >,
  ): Promise<LaunchResult> {
    const gracefulResult = await Promise.race([
      spawned.result.then(result => ({ status: "completed" as const, result })),
      managedStopDeadline().then(() => ({ status: "timeout" as const })),
    ])
    if (gracefulResult.status === "completed") return gracefulResult.result
    try {
      spawned.session.terminateNow()
    } catch (error) {
      logger.warn(
        { err: error },
        "sessiond: managed launch force terminate threw",
      )
    }
    return await spawned.result
  }

  async function managedStopDeadline(): Promise<void> {
    if (managedStopGraceMs <= 0) {
      await Promise.resolve()
      return
    }
    await delay(managedStopGraceMs)
  }

  /**
   * Phase 4D / Track A. Spawn the wait monitor as the next active
   * child under the same launchId. On successful spawn, emits
   * wait-monitor-running, awaits the wait monitor's exit, emits
   * wait-monitor-exited, and returns its result so the caller can
   * use that exit code as the launch's terminal. On spawn failure,
   * returns a degraded-to-anchor sentinel so the caller falls through
   * to the anchor branch (per the documented graceful-degradation
   * decision).
   */
  async function runSessionWaitMonitor(
    launchId: string,
    wait: LaunchSpec,
  ): Promise<
    | { readonly status: "completed"; readonly result: LaunchResult }
    | { readonly status: "degraded-to-anchor" }
  > {
    const spawn = launcher.spawn
    if (!spawn) {
      // No spawn capability -- fall back to running the wait monitor
      // through the blocking launcher.run path.
      const waitResult = await launcher.run(wait)
      pushLifecycleEvent(launchId, {
        type: "wait-monitor-running",
      })
      pushLifecycleEvent(launchId, {
        type: "wait-monitor-exited",
        terminal: terminalFromLaunchResult(waitResult),
      })
      return { status: "completed", result: waitResult }
    }
    let spawned: Awaited<ReturnType<typeof spawn>>
    try {
      spawned = await spawn(wait)
    } catch (error) {
      logger.warn(
        { err: error, launchId },
        "sessiond: wait monitor spawn threw; degrading to session-anchor",
      )
      return { status: "degraded-to-anchor" }
    }
    if (spawned.status === "failed") {
      logger.warn(
        { launchId, failureKind: "wait-monitor-spawn-failed" },
        "sessiond: wait monitor spawn returned failed; degrading to session-anchor",
      )
      return { status: "degraded-to-anchor" }
    }
    // Wait monitor becomes the new active child; swap terminate /
    // terminateNow / processGroupId so termination targets it. The
    // cleanup hooks at the final terminal see the wait monitor's pgid.
    const active = activeManagedLaunch
    if (active?.launchId === launchId) {
      active.terminate = spawned.session.terminate
      active.terminateNow = spawned.session.terminateNow
      active.freeze = spawned.session.freeze
      active.thaw = spawned.session.thaw
      if (spawned.session.processGroupId !== undefined) {
        active.processGroupId = spawned.session.processGroupId
      }
      if (active.cancelRequested === "force") {
        spawned.session.terminateNow()
      } else if (active.cancelRequested === "graceful") {
        spawned.session.terminate()
      }
    }
    emitStatusSidecar("wait-monitor")
    pushLifecycleEvent(launchId, { type: "wait-monitor-running" })
    const waitResult = await spawned.result
    pushLifecycleEvent(launchId, {
      type: "wait-monitor-exited",
      terminal: terminalFromLaunchResult(waitResult),
    })
    return { status: "completed", result: waitResult }
  }

  /**
   * Phase 4D / Track A. Hold the role-foreground state with no live
   * child after the launcher exited cleanly. Emits session-anchored,
   * awaits an external /managed-launch/terminate call (which resolves
   * the cancelAnchor promise on the active record), then emits
   * terminated. The restoring path follows in the caller.
   */
  async function runSessionAnchor(launchId: string): Promise<void> {
    emitStatusSidecar("anchored")
    pushLifecycleEvent(launchId, {
      type: "session-anchored",
      readiness: {
        status: "ok",
        evidence: "launcher exited; anchor holding",
      },
    })
    const active = activeManagedLaunch
    if (!active || active.launchId !== launchId) return
    // If a terminate request already arrived (e.g. user pressed stop
    // before the launcher even finished), skip the wait.
    if (active.cancelRequested === undefined) {
      await new Promise<void>(resolve => {
        active.cancelAnchor = resolve
      })
    }
    pushLifecycleEvent(launchId, { type: "terminated" })
  }

  async function launchUnderSession(spec: LaunchSpec): Promise<LaunchResult> {
    const started = await startManagedLaunch(spec)
    if (started.response.status === "failed") {
      return failedLaunchResult(started.response)
    }
    if (!started.result) {
      return {
        status: "failed",
        exitCode: launchFailureExitCode("host-unavailable"),
        failureKind: "host-unavailable",
        stderrTail: "sessiond managed launch result was not registered",
      }
    }
    return await started.result
  }

  function freezeManagedLaunchById(
    launchId: string,
  ): SessiondManagedLaunchFreezeResponse {
    if (activeManagedLaunch?.launchId !== launchId) {
      return {
        status: "not-found",
        launchId,
        message: "managed launch is not active",
      }
    }
    if (activeManagedLaunch.frozen)
      return { status: "already-frozen", launchId }
    if (!activeManagedLaunch.freeze || !activeManagedLaunch.thaw) {
      return {
        status: "unsupported",
        launchId,
        message: "active managed launch cannot be frozen",
      }
    }

    activeManagedLaunch.freeze()
    activeManagedLaunch.frozen = true
    activeManagedLaunch.preFreezePhase =
      currentPhase && currentPhase !== "frozen" ? currentPhase : "running"
    emitStatusSidecar("frozen")
    pushLifecycleEvent(launchId, { type: "child-frozen" })
    return { status: "accepted", launchId }
  }

  function thawManagedLaunchById(
    launchId: string,
  ): SessiondManagedLaunchThawResponse {
    if (activeManagedLaunch?.launchId !== launchId) {
      return {
        status: "not-found",
        launchId,
        message: "managed launch is not active",
      }
    }
    if (!activeManagedLaunch.frozen)
      return { status: "already-thawed", launchId }
    if (!activeManagedLaunch.thaw) {
      return {
        status: "unsupported",
        launchId,
        message: "active managed launch cannot be thawed",
      }
    }

    thawActiveManagedLaunch(activeManagedLaunch)
    return { status: "accepted", launchId }
  }

  function thawActiveManagedLaunch(
    active: NonNullable<typeof activeManagedLaunch>,
  ) {
    if (!active.frozen) return
    active.thaw?.()
    active.frozen = false
    const restoredPhase = active.preFreezePhase ?? "running"
    active.preFreezePhase = undefined
    emitStatusSidecar(restoredPhase)
    pushLifecycleEvent(active.launchId, { type: "child-thawed" })
  }

  function terminateManagedLaunchById(
    launchId: string,
    force = false,
  ): SessiondManagedLaunchTerminateResponse {
    if (activeManagedLaunch?.launchId !== launchId) {
      return {
        status: "not-found",
        launchId,
        message: "managed launch is not active",
      }
    }

    thawActiveManagedLaunch(activeManagedLaunch)
    activeManagedLaunch.cancelRequested = force ? "force" : "graceful"
    if (force) {
      activeManagedLaunch.preSpawnAbortController?.abort()
      activeManagedLaunch.hooksRunner?.abort("force")
      activeManagedLaunch.terminateNow?.()
    } else {
      activeManagedLaunch.hooksRunner?.abort("graceful")
      activeManagedLaunch.terminate?.()
    }
    // Phase 4D / Track A. When sessiond is in the session-anchored
    // state, there is no live child to terminate -- the dispatcher is
    // blocked on cancelAnchor. Resolve it so the anchor exits and the
    // restoring path proceeds. Best-effort: clear the slot to avoid
    // double-resolve if a subsequent terminate request arrives.
    if (activeManagedLaunch.cancelAnchor) {
      const resolveAnchor = activeManagedLaunch.cancelAnchor
      activeManagedLaunch.cancelAnchor = undefined
      resolveAnchor()
    }
    if (activeManagedLaunch.cancelWaiter) {
      const resolveCancel = activeManagedLaunch.cancelWaiter
      activeManagedLaunch.cancelWaiter = undefined
      resolveCancel()
    }
    return { status: "accepted", launchId }
  }

  function leaveManagedInputSeat(
    request: SessiondManagedLaunchInputSeatLeaveRequest,
  ): SessiondManagedLaunchInputSeatLeaveResponse {
    if (activeManagedLaunch?.launchId !== request.launchId) {
      return {
        status: "not-found",
        launchId: request.launchId,
        message: "managed launch is not active",
      }
    }
    const inputSeats = activeManagedLaunch.inputSeats
    const index = inputSeats?.seats.findIndex(
      seat => seat.slot === request.slot,
    )
    if (inputSeats === undefined || index === undefined || index < 0) {
      return {
        status: "not-found",
        launchId: request.launchId,
        slot: request.slot,
        message: "input seat is not active",
      }
    }
    const seat = inputSeats.seats[index]
    if (!seat) {
      return {
        status: "not-found",
        launchId: request.launchId,
        slot: request.slot,
        message: "input seat is not active",
      }
    }
    if (seat.sourceKey !== undefined && request.sourceKey !== seat.sourceKey) {
      return {
        status: "unauthorized",
        launchId: request.launchId,
        slot: request.slot,
        message: "input seat is bound to a different source",
      }
    }
    const releasedSeat = {
      slot: seat.slot,
      playerIndex: seat.playerIndex,
      name: seat.name,
      state: "available" as const,
      reason: "explicit-leave",
    }
    for (const handle of activeManagedLaunch.preSpawnGateHandles ?? []) {
      handle.leaveInputSeat?.(request.slot)
    }
    activeManagedLaunch.inputSeats = {
      seats: inputSeats.seats.map((candidate, candidateIndex) =>
        candidateIndex === index ? releasedSeat : candidate,
      ),
    }
    pushLifecycleEvent(request.launchId, {
      type: "seat-left",
      seat: releasedSeat,
    })
    pushLifecycleEvent(request.launchId, {
      type: "seat-released",
      seat: releasedSeat,
    })
    return {
      status: "released",
      launchId: request.launchId,
      slot: request.slot,
    }
  }

  function lifecycleEventStream(launchId: string): Response {
    let subscriber:
      | {
          readonly launchId: string
          readonly controller: ReadableStreamDefaultController<Uint8Array>
          readonly heartbeat: ReturnType<typeof setInterval>
        }
      | undefined

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const replay = lifecycleEvents.filter(
          event => event.launchId === launchId,
        )
        for (const event of replay) controller.enqueue(sseData(event))
        if (replay.some(isTerminalLifecycleEvent)) {
          controller.close()
          return
        }
        if (replay.length === 0 && activeManagedLaunch?.launchId !== launchId) {
          controller.enqueue(
            sseData({
              schemaVersion: 1,
              sequence: ++eventSequence,
              launchId,
              type: "failed",
              at: new Date().toISOString(),
              message: "managed launch event replay unavailable",
            }),
          )
          controller.close()
          return
        }
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(heartbeatPayload)
          } catch {
            // Controller already closed; the close path clears the
            // interval, but a race can deliver one final tick.
          }
        }, heartbeatIntervalMs)
        subscriber = { launchId, controller, heartbeat }
        lifecycleSubscribers.add(subscriber)
      },
      cancel() {
        if (subscriber) {
          lifecycleSubscribers.delete(subscriber)
          clearInterval(subscriber.heartbeat)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    })
  }

  return {
    status,
    async handleRequest(request) {
      const url = new URL(request.url)

      if (request.method === "GET" && url.pathname === "/status") {
        return json(status())
      }

      try {
        if (request.method === "POST" && url.pathname === "/control/start") {
          await enterHome()
          return json(status())
        }
        if (request.method === "POST" && url.pathname === "/control/stop") {
          await leaveKorri()
          return json(status())
        }
        if (
          request.method === "POST" &&
          url.pathname === "/control/reconcile"
        ) {
          await reconcileHome()
          return json(status())
        }
        if (
          request.method === "GET" &&
          url.pathname === "/managed-launch/status"
        ) {
          return json(managedStatus())
        }
        if (
          request.method === "POST" &&
          url.pathname === "/managed-launch/home-toggle"
        ) {
          if (!role.toggleHome || role.homeToggleAvailable?.() === false)
            return json({ status: "unsupported" })
          return json(await role.toggleHome())
        }
        if (
          request.method === "GET" &&
          url.pathname === "/managed-launch/events"
        ) {
          const launchId = url.searchParams.get("launchId")
          if (!launchId)
            return new Response("missing launchId", { status: 400 })
          return lifecycleEventStream(launchId)
        }
        if (request.method === "POST" && url.pathname === "/managed-launch") {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchStartRequest,
          )
          if (body.status === "failed") return body.response
          const started = await startManagedLaunch(
            body.value.spec,
            body.value.launchId,
            {
              ...(body.value.lifecycle
                ? { lifecycle: body.value.lifecycle }
                : {}),
              ...(body.value.launchMetadata
                ? {
                    launchMetadata: decodeLaunchMetadata(
                      body.value.launchMetadata,
                    ),
                  }
                : {}),
              ...(body.value.launchCompanions
                ? { launchCompanions: body.value.launchCompanions }
                : {}),
              ...(body.value.wait ? { wait: body.value.wait } : {}),
              ...(body.value.hooks ? { hooks: body.value.hooks } : {}),
            },
          )
          return json(started.response)
        }
        if (
          request.method === "POST" &&
          url.pathname === "/managed-launch/terminate"
        ) {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchTerminateRequest,
          )
          if (body.status === "failed") return body.response
          return json(
            terminateManagedLaunchById(body.value.launchId, body.value.force),
          )
        }
        if (
          request.method === "POST" &&
          url.pathname === "/managed-launch/freeze"
        ) {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchFreezeRequest,
          )
          if (body.status === "failed") return body.response
          return json(freezeManagedLaunchById(body.value.launchId))
        }
        if (
          request.method === "POST" &&
          url.pathname === "/managed-launch/thaw"
        ) {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchThawRequest,
          )
          if (body.status === "failed") return body.response
          return json(thawManagedLaunchById(body.value.launchId))
        }
        if (
          request.method === "POST" &&
          url.pathname === "/managed-launch/input-seat/leave"
        ) {
          const body = await decodeRequestJson(
            request,
            decodeSessiondManagedLaunchInputSeatLeaveRequest,
          )
          if (body.status === "failed") return body.response
          return json(leaveManagedInputSeat(body.value))
        }
        if (request.method === "POST" && url.pathname === "/launch") {
          const body = (await request.json()) as { readonly spec?: LaunchSpec }
          if (!body.spec) return new Response("missing spec", { status: 400 })
          const result = await launchUnderSession(body.spec)
          return json({ result, ...status() })
        }
      } catch (error) {
        logger.warn(
          { err: error, path: url.pathname },
          "sessiond request failed",
        )
        return new Response(
          error instanceof Error ? error.message : String(error),
          {
            status: 500,
          },
        )
      }

      return new Response("not found", { status: 404 })
    },
  }
}

export async function startKorriSessiond(
  options: KorriSessiondOptions,
): Promise<KorriSessiondHandle> {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME
  const core = createKorriSessiondCore(options)
  if (options.socketPath) {
    await unlink(options.socketPath).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    })
  }
  const serveOptions = {
    ...(options.socketPath
      ? { unix: options.socketPath }
      : { port: options.port ?? DEFAULT_PORT, hostname }),
    // The /managed-launch/events SSE stream is intentionally long-lived
    // for the duration of a launch. Heartbeats (see `lifecycleEventStream`)
    // keep most idle windows healthy, but a closed stream is misread by
    // observers as a launch failure and triggers a SIGTERM cascade. The
    // explicit policy here is "this server does not time out idle
    // connections" -- heartbeats are correctness, this is safety net.
    idleTimeout: 0,
    fetch: (request: Request) => core.handleRequest(request),
  }
  const server = Bun.serve(serveOptions as Parameters<typeof Bun.serve>[0])

  const listenPort = options.socketPath
    ? undefined
    : (server.port ?? options.port ?? DEFAULT_PORT)
  ;(options.logger ?? defaultLogger).info(
    { port: listenPort, hostname, socketPath: options.socketPath },
    "sessiond listening",
  )

  return {
    ...(listenPort !== undefined ? { port: listenPort, hostname } : {}),
    socketPath: options.socketPath,
    status: core.status,
    stop: async () => {
      server.stop(true)
    },
  }
}

function json(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
}

async function decodeRequestJson<T>(
  request: Request,
  decode: (input: unknown) => T,
): Promise<
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "failed"; readonly response: Response }
> {
  try {
    return { status: "ok", value: decode(await request.json()) }
  } catch (error) {
    return {
      status: "failed",
      response: json(
        {
          error: "bad-request",
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      ),
    }
  }
}

function failedLaunchResult(
  response: Extract<SessiondManagedLaunchStartResponse, { status: "failed" }>,
): Extract<LaunchResult, { status: "failed" }> {
  return {
    status: "failed",
    exitCode: launchFailureExitCode(response.failureKind),
    failureKind: response.failureKind,
    stderrTail: response.message,
  }
}

/**
 * Closest stable game identity for the hook env contract
 * (`KORRI_GAME_ID`). The `@korri:game` annotation is the canonical launch
 * identity carried on launch metadata (see `game-stream-runner.ts`'s
 * frozen-launch matching); its `id` is the playable/game id.
 */
function gameIdFromLaunchMetadata(
  metadata: LaunchMetadata | undefined,
): string | undefined {
  const annotation = metadata?.annotations?.["@korri:game"]
  if (!annotation || typeof annotation !== "object") return undefined
  const id = (annotation as Record<string, unknown>).id
  return typeof id === "string" && id.length > 0 ? id : undefined
}

function isRemapDirtyCleanupResult(
  result: LaunchResult,
  launchCompanions: LaunchCompanionMap | undefined,
): boolean {
  return (
    result.status === "failed" &&
    result.exitCode === KORRI_REMAP_DIRTY_CLEANUP_EXIT_CODE &&
    launchCompanions?.[KORRI_REMAP_PLUGIN_ID] !== undefined
  )
}

function terminalFromLaunchResult(
  result: LaunchResult,
): NonNullable<SessiondManagedLaunchEvent["terminal"]> {
  if (result.status === "launched") return { exitCode: 0 }
  return {
    exitCode: result.exitCode,
    ...(result.failureKind ? { failureKind: result.failureKind } : {}),
    ...(result.stderrTail ? { stderrTail: result.stderrTail } : {}),
  }
}

function sseData(event: SessiondManagedLaunchEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function isTerminalLifecycleEvent(event: SessiondManagedLaunchEvent): boolean {
  // Phase 4D / Track A. `terminated` is no longer terminal -- under
  // session-anchor lifecycle, it precedes `restoring` and the role's
  // terminal readiness event. The truly-terminal signals are the
  // role's idle-ready / home-ready (success), `failed`, or
  // `recovering` (restoration failure).
  return ["home-ready", "idle-ready", "failed", "recovering"].includes(
    event.type,
  )
}

function realRendererController(): KorriRendererController {
  return createChromiumController({
    config: {
      executablePath: process.env.KORRI_CHROMIUM_APP,
      hostUrl: process.env.KORRI_WEB_SURFACE_URL,
      stateRoot: process.env.KORRI_CHROMIUM_STATE_ROOT,
      statusFile: process.env.KORRI_DESKTOP_STATUS_FILE,
      logPath: process.env.KORRI_CHROMIUM_LOG,
      readinessTimeoutMs: process.env.KORRI_CHROMIUM_READY_TIMEOUT_MS
        ? Number.parseInt(process.env.KORRI_CHROMIUM_READY_TIMEOUT_MS, 10)
        : 10_000,
    },
    runner: realChromiumRunner,
  })
}

function realSwayCommandRunner(): SwayCommandRunner {
  return {
    run: async args => {
      const proc = Bun.spawn(["swaymsg", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, ...discoverSwaySocketEnv() },
      })
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited
      if (exitCode !== 0)
        throw new Error(stderr || stdout || `swaymsg exited ${exitCode}`)
      return stdout
    },
  }
}

function realSwayController(): SwayController {
  const runner = realSwayCommandRunner()
  return createSwayController({ runner, selector: korriSwaySelectorFromEnv() })
}

function korriSwaySelectorFromEnv(): SwayWindowSelector {
  return {
    appIds: envList("KORRI_SWAY_APP_IDS"),
    appIdPrefixes: envList("KORRI_SWAY_APP_ID_PREFIXES"),
    titles: envList("KORRI_SWAY_TITLES"),
    classes: envList("KORRI_SWAY_CLASSES"),
  }
}

function realSourceMachineSwayController(): SourceMachineSwayController {
  const selector = streamSurfaceSelectorFromEnv()
  const runner = realSwayCommandRunner()
  return {
    getForegroundWindows: async () => {
      const raw = await runner.run(["-t", "get_tree"])
      const tree = JSON.parse(raw)
      return findStreamSurfaceWindows(tree, selector).map(surface => ({
        id: surface.id,
        focused: surface.focused,
        fullscreen: surface.fullscreen,
        appId: surface.appId ?? null,
        title: surface.title ?? null,
      }))
    },
    clearForegroundWindows: async windows => {
      for (const window of windows) {
        try {
          await runner.run([`[con_id=${window.id}] kill`])
        } catch (error) {
          if (!isTransientMissingSurfaceCommandError(error)) throw error
        }
      }
    },
  }
}

function realSourceMachineSurfaceRepair() {
  const selector = streamSurfaceSelectorFromEnv()
  const runner = realSwayCommandRunner()
  return async () => {
    await repairStreamSurface({
      runner,
      selector,
      timeoutMs: parsePositiveIntEnv(
        "KORRI_STREAM_SURFACE_READY_TIMEOUT_MS",
        60_000,
      ),
    })
  }
}

function streamSurfaceSelectorFromEnv(): SwayWindowSelector {
  const appIds = envList("KORRI_STREAM_SURFACE_APP_IDS")
  return {
    appIds,
    titles: envList("KORRI_STREAM_SURFACE_TITLES"),
    classes: envList("KORRI_STREAM_SURFACE_CLASSES"),
    allowAnonymous:
      envFlag("KORRI_STREAM_SURFACE_ALLOW_ANONYMOUS") ??
      (appIds ?? []).includes("gamescope"),
  }
}

function realServiceManager(): KorriSessiondServiceManager {
  const controlsEssway = process.env.KORRI_SESSIOND_ESSWAY_CONTROL === "1"
  return {
    async maskEssway() {
      if (!controlsEssway) return
      await runSystemctl(["mask", "--runtime", "essway.service"])
      await runSystemctl(["stop", "essway.service"])
    },
    async restoreEssway() {
      if (!controlsEssway) return
      await runSystemctl(["unmask", "--runtime", "essway.service"])
      await runSystemctl(["start", "essway.service"])
    },
  }
}

async function runSystemctl(args: readonly string[]) {
  const proc = Bun.spawn(["systemctl", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  })
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0)
    throw new Error(stderr || `systemctl ${args.join(" ")} failed`)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
  })
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function envFlag(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return undefined
  if (["1", "true", "yes", "on"].includes(raw)) return true
  if (["0", "false", "no", "off"].includes(raw)) return false
  return undefined
}

function envList(name: string): readonly string[] | undefined {
  const raw = process.env[name]
  if (!raw?.trim()) return undefined
  return raw
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
}

async function main() {
  const socketPath = process.env.KORRI_SESSIOND_SOCKET
  if (!socketPath) throw new Error("KORRI_SESSIOND_SOCKET is required")
  const port = Number.parseInt(
    process.env.KORRI_SESSIOND_PORT ?? `${DEFAULT_PORT}`,
    10,
  )
  const roleId = process.env.KORRI_SESSIOND_ROLE ?? "kiosk"
  const kioskPolicy = process.env.KORRI_SESSIOND_KIOSK_POLICY ?? "legacy"
  let swayLaneSupervisor: SwayLaneEventSupervisor | undefined
  const role: SessionRole | undefined =
    roleId === "source-machine"
      ? createSourceMachineSessionRole({
          sway: realSourceMachineSwayController(),
          processList: { list: async () => [] },
          surfaceRepair: realSourceMachineSurfaceRepair(),
        })
      : roleId === "kiosk" && kioskPolicy === "lanes"
        ? (() => {
            const runner = realSwayCommandRunner()
            const laneController = createKorriLaneController({
              runner,
              lanes: {
                hub: process.env.KORRI_SESSIOND_HUB_WORKSPACE ?? "korri:hub",
                game:
                  process.env.KORRI_SESSIOND_GAME_WORKSPACE ??
                  "korri:game:active",
              },
            })
            const supervisor = createSwayLaneEventSupervisor({
              discover: () => discoverSwaySocketPath(),
              createSource: ({ socketPath, onStatus }) =>
                createSessiondSwayEventSource({
                  socketPath,
                  onEvent: event => laneController.handleSwayEvent(event),
                  onDiagnostic: diagnostic =>
                    defaultLogger.warn(
                      { diagnostic },
                      "sessiond Sway event diagnostic",
                    ),
                  onStatus,
                }),
              onDiagnostic: diagnostic =>
                defaultLogger.warn(
                  { diagnostic },
                  "sessiond Sway lane supervisor diagnostic",
                ),
            })
            swayLaneSupervisor = supervisor
            supervisor.start()
            return createLaneAwareKioskSessionRole({
              renderer: realRendererController(),
              sway: createSwayController({
                runner,
                selector: korriSwaySelectorFromEnv(),
              }),
              serviceManager: realServiceManager(),
              laneController,
              laneToggleAvailable: () => supervisor.isAvailable(),
            })
          })()
        : undefined

  const statusSidecar =
    roleId === "source-machine"
      ? createStatusSidecar({
          path: process.env.KORRI_GAME_STREAM_STATUS_PATH,
          logger: defaultLogger,
        })
      : undefined

  // Source machines watch Sunshine for client disconnect/reconnect signals
  // and freeze/thaw the active launch by default. The watcher drives its
  // freeze/thaw through this daemon's own managed-launch endpoints so there
  // is exactly one lifecycle authority.
  const sunshineWatcher: SunshineStreamWatcher | null =
    roleId === "source-machine"
      ? startSunshineStreamWatcherFromEnv({
          env: process.env,
          logger: defaultLogger,
        })
      : null

  const handle = await startKorriSessiond({
    ...(socketPath ? { socketPath } : { port }),
    ...(role ? { role } : {}),
    ...(statusSidecar ? { statusSidecar } : {}),
    sessionHooks: sessionLifecycleHooksFromEnv(process.env),
    preSpawnGates: sessiondPreSpawnGatesFromEnv(process.env),
  })

  const shutdown = async (signal: string) => {
    defaultLogger.info({ signal }, "sessiond shutting down")
    swayLaneSupervisor?.stop()
    sunshineWatcher?.stop()
    await handle.stop()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

if (import.meta.main) {
  main().catch(error => {
    defaultLogger.error({ err: error }, "sessiond failed")
    process.exit(1)
  })
}
