import type { LaunchSpec } from "@shared/library/launcher"
import type {
  LaunchReadyMode,
  TerminalReadinessEventType,
} from "@shared/library/sessiond-managed-launch-protocol"
import type { KorriSessiondServiceManager } from "./sessiond"
import type {
  KorriRendererController,
  KorriRendererStatus,
} from "./sessiond-renderer"
import { rendererStatus } from "./sessiond-renderer"
import { evaluateHomeInvariant } from "./sessiond-state"
import type { SwayController } from "./sessiond-sway"

/**
 * Identifier for the deployment role that defines what "idle" means for
 * this sessiond instance. Kiosk's idle = Korri home (Electrobun renderer +
 * essway masked). Source-machine's idle = Sway alive with no foreground
 * application windows.
 */
export type SessionRoleId = "kiosk" | "source-machine"

export interface SessionRole {
  /** Stable role identity surfaced to clients and logs. */
  readonly id: SessionRoleId

  /**
   * Wire-protocol mode label for this role's idle target.
   * Kiosk: `"home"`. Source-machine: `"idle"`. Sessiond translates its
   * internal `state.mode === "home"` to this label in managed-launch
   * status responses.
   */
  readonly idleModeLabel: LaunchReadyMode

  /** Terminal readiness event emitted on the wire when idle is restored. */
  readonly idleReadyEventName: TerminalReadinessEventType

  /**
   * Whether sessiond should emit `renderer-stopped` between
   * `beforeChildLaunch` and `child-running` for this role. Kiosk emits it
   * (Electrobun gets stopped); source-machine does not (no renderer).
   */
  readonly emitsRendererStopped: boolean

  /**
   * Drive the host to the role's idle target. Called from `/control/start`.
   * The state machine moves to `home` in the caller; this method performs
   * the external effects (mask units, launch renderer, reconcile windows).
   */
  enterIdle: () => Promise<void>

  /**
   * Tear down the role's idle target. Called from `/control/stop` and from
   * unrecoverable restore failures. Symmetric to {@link enterIdle}.
   */
  leaveIdle: () => Promise<void>

  /**
   * Prepare the host to spawn a managed launch child. Kiosk stops the
   * renderer here; source-machine is a no-op (nothing in the foreground to
   * yield).
   */
  beforeChildLaunch: () => Promise<void>

  /**
   * Phase 4D / Track A. Called exactly once per managed launch, after
   * the primary child is observed running and before the launch's
   * lifecycle proceeds past `child-running`. The role does any
   * foreground-surface promotion here (e.g. source-machine repairs
   * the Gamescope window via game-stream-fullscreen).
   *
   * Kiosk role: no-op -- Electrobun owns the renderer and Gamescope
   * is not in the kiosk path.
   *
   * Throwing from this hook fails the managed launch; sessiond maps
   * the throw to a `child-exited` event with
   * `failureKind: "host-unavailable"` and proceeds through restoring
   * to the role's terminal readiness event.
   */
  afterChildRunning: (spec: LaunchSpec) => Promise<void>

  /**
   * Restore the role's idle target after a managed launch child exits.
   * Kiosk relaunches the renderer and reconciles home; source-machine
   * asserts the idle-blank invariant.
   */
  restoreIdleAfterLaunch: () => Promise<void>

  /**
   * Continuous reconciliation pass. Called from `/control/reconcile` and
   * during `enterIdle`. Idempotent.
   */
  reconcileIdle: () => Promise<void>

  /**
   * Diagnostic evidence string surfaced with the terminal readiness event.
   */
  idleReadyEvidence: () => string

  /** Renderer status snapshot for the `/status` response. */
  rendererStatus: () => KorriRendererStatus
}

export interface KioskSessionRoleDeps {
  readonly renderer: KorriRendererController
  readonly sway: SwayController
  readonly serviceManager: KorriSessiondServiceManager
}

/**
 * Compose the kiosk session role from the same renderer / sway / service
 * manager controllers sessiond has always used. Behavior is identical to
 * the pre-Phase-4C kiosk supervisor; the role boundary just makes the
 * orchestration role-agnostic.
 */
export function createKioskSessionRole(
  deps: KioskSessionRoleDeps,
): SessionRole {
  let rendererPid: number | undefined
  // task-015 AC #5: track the last reconcile outcome so home-ready
  // evidence describes what the role actually verified, not a fixed
  // string. This lets monitors and the operator UI distinguish
  // "home was already satisfied" from "renderer was relaunched" or
  // "focus/fullscreen was repaired".
  let lastReconcile: KioskReconcileSummary = {
    windowCount: 0,
    relaunchedRenderer: false,
    closedDuplicates: 0,
    repairedFocus: false,
    repairedFullscreen: false,
  }

  const reconcile = async () => {
    const windows = await deps.sway.getKorriWindows()
    const decisions = evaluateHomeInvariant({ windows })
    const summary: KioskReconcileSummary = {
      windowCount: windows.length,
      relaunchedRenderer: false,
      closedDuplicates: 0,
      repairedFocus: false,
      repairedFullscreen: false,
    }
    if (decisions.some(decision => decision.kind === "relaunch-renderer")) {
      const launched = await deps.renderer.launch()
      rendererPid = launched.pid
      summary.relaunchedRenderer = true
    }
    for (const decision of decisions) {
      if (decision.kind === "close-duplicate-windows") {
        summary.closedDuplicates = decision.duplicateWindowIds.length
      }
      if (decision.kind === "repair-window") {
        summary.repairedFocus = decision.repairs.includes("focus")
        summary.repairedFullscreen = decision.repairs.includes("fullscreen")
      }
    }
    await deps.sway.applyDecisions(
      decisions.filter(decision => decision.kind !== "relaunch-renderer"),
    )
    lastReconcile = summary
  }

  return {
    id: "kiosk",
    idleModeLabel: "home",
    idleReadyEventName: "home-ready",
    emitsRendererStopped: true,
    enterIdle: async () => {
      await deps.serviceManager.maskEssway()
      const launched = await deps.renderer.launch()
      rendererPid = launched.pid
      await reconcile()
    },
    leaveIdle: async () => {
      await deps.renderer.stop(rendererPid)
      rendererPid = undefined
      await deps.serviceManager.restoreEssway()
    },
    beforeChildLaunch: async () => {
      await deps.renderer.stop(rendererPid)
      rendererPid = undefined
    },
    // Kiosk has no foreground surface to promote -- Electrobun owns
    // the renderer and Gamescope is not in the kiosk path. Source-
    // machine implements this hook in U5; the interface declares it
    // here so sessiond's dispatcher can call it role-agnostically.
    afterChildRunning: async () => {},
    restoreIdleAfterLaunch: async () => {
      const launched = await deps.renderer.launch()
      rendererPid = launched.pid
      await reconcile()
    },
    reconcileIdle: reconcile,
    // task-015 AC #5: structured evidence string. Format is a
    // single line so it fits the SSE-event evidence field, but the
    // keys let operators and tests assert specifically on which
    // repairs ran. "satisfied" appears only when no repair was
    // necessary, distinguishing the post-reconcile state from a
    // happy steady state.
    idleReadyEvidence: () => formatKioskReadyEvidence(lastReconcile),
    rendererStatus: () => rendererStatus(deps.renderer, rendererPid),
  }
}

interface KioskReconcileSummary {
  windowCount: number
  relaunchedRenderer: boolean
  closedDuplicates: number
  repairedFocus: boolean
  repairedFullscreen: boolean
}

export function formatKioskReadyEvidence(
  summary: KioskReconcileSummary,
): string {
  const parts = [`windows=${summary.windowCount}`]
  if (summary.relaunchedRenderer) parts.push("renderer-relaunched")
  if (summary.closedDuplicates > 0)
    parts.push(`duplicates-closed=${summary.closedDuplicates}`)
  if (summary.repairedFocus) parts.push("focus-repaired")
  if (summary.repairedFullscreen) parts.push("fullscreen-repaired")
  if (
    !summary.relaunchedRenderer &&
    summary.closedDuplicates === 0 &&
    !summary.repairedFocus &&
    !summary.repairedFullscreen
  ) {
    parts.push("satisfied")
  }
  return `home-invariant ${parts.join(" ")}`
}
