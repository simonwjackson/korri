/**
 * Source-machine `SessionRole` implementation.
 *
 * Source-machine hosts run Korri server + Sunshine + Sway but no Korri
 * GUI client. The role's idle target is "Sway alive, application units
 * inert" (not "compositor down" — that would trigger the documented
 * SIGSEGV restart-loop class). The role asserts the idle-blank invariant
 * via three checks at the restoring transition:
 *
 *   1. No Sway windows match the Gamescope selector.
 *   2. No live `gamescope-wl` / `gamescopereaper` PIDs.
 *   3. A bounded cooldown has elapsed since the last child exit.
 *
 * Plan: docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md (U3)
 */

import type { LaunchSpec } from "@platform/library/launcher"
import type { TerminalReadinessEventType } from "@platform/library/sessiond-managed-launch-protocol"
import {
  GAMESCOPE_PROCESS_NAMES,
  type ProcessInfo,
  type ProcessListQuery,
} from "./sessiond-gamescope-reaper"
import {
  formatSessionRoleReadyEvidence,
  type SessionRole,
  type SessionRoleReadyEvidence,
} from "./sessiond-role"
import type { KorriWindowSnapshot } from "./sessiond-state"

export interface SourceMachineSwayController {
  /**
   * Returns the current set of Gamescope-selected windows in the live
   * Sway tree. The production implementation runs `swaymsg -t get_tree`
   * and filters via `DEFAULT_GAMESCOPE_SELECTOR`.
   */
  getGamescopeWindows: () => Promise<readonly KorriWindowSnapshot[]>
  /**
   * Close the supplied Gamescope windows (Sway `[con_id=...] kill`).
   * Tests inject a recording stub; production runs swaymsg.
   */
  clearGamescopeWindows: (
    windows: readonly KorriWindowSnapshot[],
  ) => Promise<void>
}

export interface IdleBlankSnapshot {
  readonly gamescopeWindows: readonly KorriWindowSnapshot[]
  readonly gamescopeProcesses: readonly ProcessInfo[]
  readonly cooldownElapsedMs: number
}

export interface IdleBlankChecks {
  readonly gamescopeWindowsAbsent: boolean
  readonly gamescopeProcessesAbsent: boolean
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
  const gamescopeWindowsAbsent = snapshot.gamescopeWindows.length === 0
  const gamescopeProcessesAbsent = snapshot.gamescopeProcesses.length === 0
  const cooldownElapsed = snapshot.cooldownElapsedMs >= policy.cooldownMs
  const checks: IdleBlankChecks = {
    gamescopeWindowsAbsent,
    gamescopeProcessesAbsent,
    cooldownElapsed,
  }
  let status: IdleBlankAssessment["status"]
  if (!gamescopeWindowsAbsent) status = "clear-foreground"
  else if (!gamescopeProcessesAbsent) status = "clear-processes"
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
}

const DEFAULT_COOLDOWN_MS = 750
const DEFAULT_POLL_INTERVAL_MS = 100
const DEFAULT_MAX_READY_ATTEMPTS = 60

function isGamescopeProcess(info: ProcessInfo): boolean {
  return (GAMESCOPE_PROCESS_NAMES as readonly string[]).includes(info.comm)
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

  let cooldownStartMs = clock()
  let latestChecks: IdleBlankChecks = {
    gamescopeWindowsAbsent: true,
    gamescopeProcessesAbsent: true,
    cooldownElapsed: true,
  }

  const snapshot = async (): Promise<IdleBlankSnapshot> => {
    const [gamescopeWindows, allProcesses] = await Promise.all([
      deps.sway.getGamescopeWindows(),
      deps.processList.list(),
    ])
    const gamescopeProcesses = allProcesses.filter(isGamescopeProcess)
    return {
      gamescopeWindows,
      gamescopeProcesses,
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
        await deps.sway.clearGamescopeWindows(snap.gamescopeWindows)
      }
      // "clear-processes" — sessiond's reaper runs before restoreIdle so
      // this branch usually means the reaper has not finished yet; wait
      // for the next snapshot. "waiting" — cooldown not elapsed; sleep.

      if (pollIntervalMs > 0) await delay(pollIntervalMs)
    }

    const reason =
      lastAssessment?.status === "clear-processes"
        ? "gamescope processes lingered past idle-blank budget"
        : lastAssessment?.status === "clear-foreground"
          ? "gamescope windows lingered past idle-blank budget"
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
    // the foreground Gamescope window here -- the same job the
    // runner used to own inline before Track A.
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
        await deps.sway.clearGamescopeWindows(snap.gamescopeWindows)
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
    gamescopeWindowsAbsent: checks.gamescopeWindowsAbsent,
    gamescopeProcessesAbsent: checks.gamescopeProcessesAbsent,
    cooldownElapsed: checks.cooldownElapsed,
  }
}
