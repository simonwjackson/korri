import { readdirSync } from "node:fs"
import { unlink } from "node:fs/promises"
import { join } from "node:path"
import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import {
  type LaunchResult,
  type LaunchSpec,
  launchFailureExitCode,
  type ManagedLaunchResult,
} from "@platform/library/launcher"
import { projectManagedLaunchStatus } from "@platform/library/sessiond-lifecycle-projections"
import {
  decodeSessiondManagedLaunchStartRequest,
  decodeSessiondManagedLaunchTerminateRequest,
  type SessiondManagedLaunchEvent,
  type SessiondManagedLaunchStartResponse,
  type SessiondManagedLaunchStatus,
  type SessiondManagedLaunchTerminateResponse,
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
  repairStreamSurface,
} from "./game-stream-fullscreen"
import {
  createElectrobunController,
  realElectrobunRunner,
} from "./sessiond-electrobun"
import { sessionLifecycleHooksFromEnv } from "./sessiond-plugin-composition"
import type {
  KorriRendererController,
  KorriRendererStatus,
} from "./sessiond-renderer"
import {
  createKioskSessionRole,
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
const RESTORE_RETRY_DELAY_MS = 250
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
  const statusSidecar = options.statusSidecar
  let state: KorriSessionState = initialKorriSessionState
  let eventSequence = 0
  const lifecycleEvents: SessiondManagedLaunchEvent[] = []
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000
  const managedStopGraceMs =
    options.managedStopGraceMs ?? DEFAULT_MANAGED_STOP_GRACE_MS
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
        processGroupId?: number
        // Phase 4D / Track A. Set while sessiond is in the session-
        // anchored state (no live child, waiting for an external
        // terminate). terminateManagedLaunchById calls this to wake
        // the dispatcher; resetting falls back to terminate/terminateNow.
        cancelAnchor?: () => void
        cancelWaiter?: () => void
        sessionHookHandles?: readonly KorriSessiondLifecycleHookHandle[]
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
    | "restoring"
    | undefined

  function status(): KorriSessiondStatus {
    return {
      state,
      renderer: role.rendererStatus(),
    }
  }

  function emitStatusSidecar(
    phase?: "launching" | "running" | "wait-monitor" | "anchored" | "restoring",
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

  function managedStatus(): SessiondManagedLaunchStatus {
    return projectManagedLaunchStatus({
      mode: state.mode,
      idleModeLabel: role.idleModeLabel,
      active: korriSessionActiveLaunch(state),
      ...(currentPhase ? { phase: currentPhase } : {}),
      ...(state.failureReason ? { failureReason: state.failureReason } : {}),
      restoreAttempts: state.restoreAttempts,
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: typeof launcher.spawn === "function",
        // Phase 4D / Track A. Sessiond now understands
        // lifecycle: "session" start requests and emits
        // launcher-exited / wait-monitor-{running,exited} /
        // session-anchored peers. Phase 4B clients omitting the
        // field still negotiate to foreground correctly.
        sessionLifecycle: true,
      },
    })
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

  async function startManagedLaunch(
    spec: LaunchSpec,
    requestedLaunchId?: string,
    lifecycleOptions: {
      readonly lifecycle?: "foreground" | "session"
      readonly launchMetadata?: LaunchMetadata
      readonly launchCompanions?: LaunchCompanionMap
      readonly wait?: LaunchSpec
    } = {},
  ): Promise<{
    readonly response: SessiondManagedLaunchStartResponse
    readonly result?: Promise<LaunchResult>
  }> {
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
    activeManagedLaunch = { launchId }
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
    } = {},
  ): Promise<LaunchResult> {
    const lifecycle = lifecycleOptions.lifecycle ?? "foreground"
    const wait = lifecycleOptions.wait
    const launchMetadata = lifecycleOptions.launchMetadata
    const launchCompanions = lifecycleOptions.launchCompanions
    let result: LaunchResult | undefined

    try {
      await role.beforeChildLaunch()
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
              logger.warn({ err: error }, "sessiond: afterChildRunning failed")
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
          const message = error instanceof Error ? error.message : String(error)
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
    await cleanupLifecycleHooks(launchId, pgid, launchMetadata, launchCompanions)

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
        await delay(RESTORE_RETRY_DELAY_MS)
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

    activeManagedLaunch.cancelRequested = force ? "force" : "graceful"
    if (force) {
      activeManagedLaunch.terminateNow?.()
    } else {
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
  return createElectrobunController({
    config: {
      executablePath: process.env.KORRI_ELECTROBUN_APP,
      stateRoot: process.env.KORRI_ELECTROBUN_STATE_ROOT,
      statusFile: process.env.KORRI_ELECTROBUN_STATUS_FILE,
      logPath: process.env.KORRI_ELECTROBUN_LOG,
      sessiondSocket: process.env.KORRI_SESSIOND_SOCKET,
      readinessTimeoutMs: process.env.KORRI_ELECTROBUN_READY_TIMEOUT_MS
        ? Number.parseInt(process.env.KORRI_ELECTROBUN_READY_TIMEOUT_MS, 10)
        : 10_000,
    },
    runner: realElectrobunRunner,
  })
}

/**
 * Discover Sway's IPC socket from XDG_RUNTIME_DIR. The kiosk image
 * runs sway in korri-compositor.service while korri-sessiond is a
 * sibling unit; sessiond doesn't inherit SWAYSOCK from the
 * compositor's process tree, and swaymsg refuses to run without
 * either SWAYSOCK or I3SOCK set. Match the `sway-ipc.<uid>.<pid>.sock`
 * convention sway uses; return the first match (there is one sway
 * per host on a Korri kiosk by construction).
 */
function discoverSwaySocketEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  if (env.SWAYSOCK) return { SWAYSOCK: env.SWAYSOCK }
  const runtimeDir = env.XDG_RUNTIME_DIR
  if (!runtimeDir) return {}
  try {
    const entry = readdirSync(runtimeDir).find(
      name => name.startsWith("sway-ipc.") && name.endsWith(".sock"),
    )
    return entry ? { SWAYSOCK: join(runtimeDir, entry) } : {}
  } catch {
    return {}
  }
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
        throw new Error(stderr || `swaymsg exited ${exitCode}`)
      return stdout
    },
  }
}

function realSwayController(): SwayController {
  const runner = realSwayCommandRunner()

  const selector: SwayWindowSelector = {
    appIds: envList("KORRI_SWAY_APP_IDS"),
    titles: envList("KORRI_SWAY_TITLES"),
    classes: envList("KORRI_SWAY_CLASSES"),
  }
  return createSwayController({ runner, selector })
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
        await runner.run([`[con_id=${window.id}] kill`])
      }
    },
  }
}

function realSourceMachineSurfaceRepair() {
  const selector = streamSurfaceSelectorFromEnv()
  const runner = realSwayCommandRunner()
  return async () => {
    await repairStreamSurface({ runner, selector })
  }
}

function streamSurfaceSelectorFromEnv(): SwayWindowSelector {
  return {
    appIds: envList("KORRI_STREAM_SURFACE_APP_IDS"),
    titles: envList("KORRI_STREAM_SURFACE_TITLES"),
    classes: envList("KORRI_STREAM_SURFACE_CLASSES"),
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
  const role: SessionRole | undefined =
    roleId === "source-machine"
      ? createSourceMachineSessionRole({
          sway: realSourceMachineSwayController(),
          processList: { list: async () => [] },
          surfaceRepair: realSourceMachineSurfaceRepair(),
        })
      : undefined

  const statusSidecar =
    roleId === "source-machine"
      ? createStatusSidecar({
          path: process.env.KORRI_GAME_STREAM_STATUS_PATH,
          logger: defaultLogger,
        })
      : undefined

  const handle = await startKorriSessiond({
    ...(socketPath ? { socketPath } : { port }),
    ...(role ? { role } : {}),
    ...(statusSidecar ? { statusSidecar } : {}),
    sessionHooks: sessionLifecycleHooksFromEnv(process.env),
  })

  const shutdown = async (signal: string) => {
    defaultLogger.info({ signal }, "sessiond shutting down")
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
