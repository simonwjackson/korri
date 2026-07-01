/**
 * Source-machine `SessionRole` implementation.
 *
 * Source-machine hosts run Korri daemon + Sunshine + Sway but no Korri
 * GUI client. The role's idle target is "Sway alive, application units
 * inert" (not "compositor down" — that would trigger compositor
 * restart-loop failures). The role asserts the idle-blank invariant via
 * generic foreground-window, residual-process, and cooldown checks.
 *
 * Plan: docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md (U3)
 */

import type { LaunchSpec } from "@platform/library/launcher"
import type { TerminalReadinessEventType } from "@platform/library/sessiond-managed-launch-protocol"
import {
  formatSessionRoleReadyEvidence,
  type SessionRole,
  type SessionRoleReadyEvidence,
} from "./sessiond-role"
import type { KorriWindowSnapshot } from "./sessiond-state"

export interface ProcessInfo {
  readonly pid: number
  readonly pgid: number
  readonly ppid: number
  readonly comm: string
}

export interface ProcessListQuery {
  list: () => Promise<readonly ProcessInfo[]>
}

export interface SourceMachineSwayController {
  /**
   * Returns the current set of foreground windows in the live
   * Sway tree. The production implementation runs `swaymsg -t get_tree`
   * and filters via the configured selector.
   */
  getForegroundWindows: () => Promise<readonly KorriWindowSnapshot[]>
  /**
   * Close the supplied foreground windows (Sway `[con_id=...] kill`).
   * Tests inject a recording stub; production runs swaymsg.
   */
  clearForegroundWindows: (
    windows: readonly KorriWindowSnapshot[],
  ) => Promise<void>
}

export interface IdleBlankSnapshot {
  readonly foregroundWindows: readonly KorriWindowSnapshot[]
  readonly residualProcesses: readonly ProcessInfo[]
  readonly cooldownElapsedMs: number
}

export interface IdleBlankChecks {
  readonly foregroundWindowsAbsent: boolean
  readonly residualProcessesAbsent: boolean
  readonly cooldownElapsed: boolean
}

export interface IdleBlankAssessment {
  readonly status: "ready" | "waiting" | "clear-foreground" | "clear-processes"
  readonly checks: IdleBlankChecks
}

export interface IdleBlankPolicy {
  readonly cooldownMs: number
}

/**
 * Pure evaluator. Given a snapshot of the host state and the role's
 * policy knobs, decide what (if anything) the role should do to reach
 * idle-blank readiness.
 */
export function evaluateIdleBlank(
  snapshot: IdleBlankSnapshot,
  policy: IdleBlankPolicy,
): IdleBlankAssessment {
  const foregroundWindowsAbsent = snapshot.foregroundWindows.length === 0
  const residualProcessesAbsent = snapshot.residualProcesses.length === 0
  const cooldownElapsed = snapshot.cooldownElapsedMs >= policy.cooldownMs
  const checks: IdleBlankChecks = {
    foregroundWindowsAbsent,
    residualProcessesAbsent,
    cooldownElapsed,
  }
  let status: IdleBlankAssessment["status"]
  if (!foregroundWindowsAbsent) status = "clear-foreground"
  else if (!residualProcessesAbsent) status = "clear-processes"
  else if (!cooldownElapsed) status = "waiting"
  else status = "ready"
  return { status, checks }
}

/**
 * Phase 4D / Track A. Foreground surface repair callback invoked by
 * the role's `afterChildRunning` hook once sessiond observes the
 * primary child is running. Production wires this to
 * `repairStreamSurface` from `product/services/device/game-stream-fullscreen.ts`
 * (the same repair logic the runner used to own before the
 * generalization). Throwing is mapped by sessiond to
 * `child-exited` with `failureKind: "host-unavailable"`.
 */
export type SourceMachineSurfaceRepair = (spec: LaunchSpec) => Promise<void>

export interface SourceMachineSessionRoleDeps {
  readonly sway: SourceMachineSwayController
  readonly processList: ProcessListQuery
  /** Wall-clock provider in milliseconds. Defaults to `Date.now`. */
  readonly clock?: () => number
  /** Sleep helper. Defaults to `setTimeout`. */
  readonly delay?: (ms: number) => Promise<void>
  /** Cooldown after child exit before idle-ready can fire. Default 750ms. */
  readonly cooldownMs?: number
  /** Poll cadence while waiting for idle-blank readiness. Default 100ms. */
  readonly pollIntervalMs?: number
  /** Max polling attempts before giving up. Default 60. */
  readonly maxReadyAttempts?: number
  /**
   * Phase 4D / Track A. Foreground surface repair callback. When set,
   * the role's `afterChildRunning` invokes this once per managed launch
   * after sessiond observes the primary child running. Omit in tests
   * that do not exercise foreground promotion -- the hook degrades to
   * a no-op.
   */
  readonly surfaceRepair?: SourceMachineSurfaceRepair
  readonly residualProcessNames?: readonly string[]
}

const DEFAULT_COOLDOWN_MS = 750
const DEFAULT_POLL_INTERVAL_MS = 100
const DEFAULT_MAX_READY_ATTEMPTS = 300

function isResidualProcess(
  info: ProcessInfo,
  residualProcessNames: readonly string[],
): boolean {
  return residualProcessNames.includes(info.comm)
}

const IDLE_READY_EVENT: TerminalReadinessEventType = "idle-ready"

export function createSourceMachineSessionRole(
  deps: SourceMachineSessionRoleDeps,
): SessionRole {
  const clock = deps.clock ?? (() => Date.now())
  const delay =
    deps.delay ??
    (ms =>
      new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms)
        if ("unref" in timer && typeof timer.unref === "function") timer.unref()
      }))
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const maxReadyAttempts = deps.maxReadyAttempts ?? DEFAULT_MAX_READY_ATTEMPTS
  const residualProcessNames = deps.residualProcessNames ?? []

  let cooldownStartMs = clock()
  let latestChecks: IdleBlankChecks = {
    foregroundWindowsAbsent: true,
    residualProcessesAbsent: true,
    cooldownElapsed: true,
  }

  const snapshot = async (): Promise<IdleBlankSnapshot> => {
    const [foregroundWindows, allProcesses] = await Promise.all([
      deps.sway.getForegroundWindows(),
      deps.processList.list(),
    ])
    const residualProcesses = allProcesses.filter(info =>
      isResidualProcess(info, residualProcessNames),
    )
    return {
      foregroundWindows,
      residualProcesses,
      cooldownElapsedMs: Math.max(0, clock() - cooldownStartMs),
    }
  }

  const reachIdleBlank = async (): Promise<void> => {
    let lastAssessment: IdleBlankAssessment | undefined
    for (let attempt = 0; attempt < maxReadyAttempts; attempt += 1) {
      const snap = await snapshot()
      const assessment = evaluateIdleBlank(snap, { cooldownMs })
      lastAssessment = assessment
      latestChecks = assessment.checks

      if (assessment.status === "ready") return

      if (assessment.status === "clear-foreground") {
        await deps.sway.clearForegroundWindows(snap.foregroundWindows)
      }
      // "clear-processes" means a cleanup hook or external process owner
      // has not finished yet; wait for the next snapshot. "waiting" means
      // cooldown has not elapsed; sleep.

      if (pollIntervalMs > 0) await delay(pollIntervalMs)
    }

    const reason =
      lastAssessment?.status === "clear-processes"
        ? "residual processes lingered past idle-blank budget"
        : lastAssessment?.status === "clear-foreground"
          ? "foreground windows lingered past idle-blank budget"
          : "idle-blank readiness budget exhausted"
    throw new Error(reason)
  }

  return {
    id: "source-machine",
    idleModeLabel: "idle",
    idleReadyEventName: IDLE_READY_EVENT,
    emitsRendererStopped: false,
    enterIdle: async () => {
      cooldownStartMs = clock() - cooldownMs // first start is already idle
    },
    leaveIdle: async () => {},
    beforeChildLaunch: async () => {
      cooldownStartMs = clock()
    },
    // Phase 4D / Track A U5. When the host wires a surfaceRepair
    // callback (production wires it to repairStreamSurface from
    // game-stream-fullscreen.ts), the source-machine role promotes
    // the foreground stream surface here -- the same job the runner
    // used to own inline before Track A.
    afterChildRunning: async spec => {
      if (!deps.surfaceRepair) return
      await deps.surfaceRepair(spec)
    },
    restoreIdleAfterLaunch: async () => {
      cooldownStartMs = clock()
      await reachIdleBlank()
    },
    reconcileIdle: async () => {
      const snap = await snapshot()
      const assessment = evaluateIdleBlank(snap, { cooldownMs })
      latestChecks = assessment.checks
      if (assessment.status === "clear-foreground") {
        await deps.sway.clearForegroundWindows(snap.foregroundWindows)
      }
    },
    idleReadyOutcome: () => ({
      status: "ok",
      evidence: idleBlankReadyEvidence(latestChecks),
    }),
    idleReadyEvidence: () =>
      formatSessionRoleReadyEvidence(idleBlankReadyEvidence(latestChecks)),
    rendererStatus: () => ({ kind: "noop" }),
  }
}

function idleBlankReadyEvidence(
  checks: IdleBlankChecks,
): Extract<SessionRoleReadyEvidence, { readonly kind: "idle-blank" }> {
  return {
    kind: "idle-blank",
    foregroundWindowsAbsent: checks.foregroundWindowsAbsent,
    residualProcessesAbsent: checks.residualProcessesAbsent,
    cooldownElapsed: checks.cooldownElapsed,
  }
}
