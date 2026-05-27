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

  const reconcile = async () => {
    const windows = await deps.sway.getKorriWindows()
    const decisions = evaluateHomeInvariant({ windows })
    if (decisions.some(decision => decision.kind === "relaunch-renderer")) {
      const launched = await deps.renderer.launch()
      rendererPid = launched.pid
    }
    await deps.sway.applyDecisions(
      decisions.filter(decision => decision.kind !== "relaunch-renderer"),
    )
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
    restoreIdleAfterLaunch: async () => {
      const launched = await deps.renderer.launch()
      rendererPid = launched.pid
      await reconcile()
    },
    reconcileIdle: reconcile,
    idleReadyEvidence: () => "home-invariant-satisfied",
    rendererStatus: () => rendererStatus(deps.renderer, rendererPid),
  }
}
