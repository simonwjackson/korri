import { describe, expect, it } from "bun:test"
import type { KorriSessiondServiceManager } from "./sessiond"
import type { KorriLaneController } from "./sessiond-lanes"
import type { KorriRendererController } from "./sessiond-renderer"
import {
  createKioskSessionRole,
  createLaneAwareKioskSessionRole,
  formatSessionRoleReadyEvidence,
  sessionRoleReadyOutcome,
} from "./sessiond-role"
import type {
  HomeInvariantDecision,
  KorriWindowSnapshot,
} from "./sessiond-state"
import type { SwayController } from "./sessiond-sway"

function makeRecordingRenderer(initialPid = 100): {
  readonly renderer: KorriRendererController
  readonly events: string[]
  readonly pidRef: { current: number }
} {
  const events: string[] = []
  const pidRef = { current: initialPid }
  const renderer: KorriRendererController = {
    kind: "test-renderer",
    launch: async () => {
      pidRef.current += 1
      events.push(`launch:${pidRef.current}`)
      return {
        pid: pidRef.current,
        command: { command: "test-renderer", args: [] },
      }
    },
    stop: async pid => {
      events.push(`stop:${pid ?? "none"}`)
    },
  }
  return { renderer, events, pidRef }
}

function makeSway(initialWindows: readonly KorriWindowSnapshot[] = []): {
  readonly sway: SwayController
  readonly events: string[]
  readonly decisions: HomeInvariantDecision[]
} {
  const events: string[] = []
  const decisions: HomeInvariantDecision[] = []
  const windows = [...initialWindows]
  const sway: SwayController = {
    getKorriWindows: async () => windows,
    applyDecisions: async incoming => {
      decisions.push(...incoming)
      events.push(...incoming.map(decision => `sway:${decision.kind}`))
      return []
    },
  }
  return { sway, events, decisions }
}

function makeServiceManager(): {
  readonly serviceManager: KorriSessiondServiceManager
  readonly events: string[]
} {
  const events: string[] = []
  const serviceManager: KorriSessiondServiceManager = {
    maskEssway: async () => {
      events.push("mask-es")
    },
    restoreEssway: async () => {
      events.push("restore-es")
    },
  }
  return { serviceManager, events }
}

describe("kiosk session role", () => {
  it("identifies as kiosk and emits home-ready evidence with renderer-stopped semantics", () => {
    const { renderer } = makeRecordingRenderer()
    const { sway } = makeSway()
    const { serviceManager } = makeServiceManager()

    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    expect(role.id).toBe("kiosk")
    expect(role.idleReadyEventName).toBe("home-ready")
    expect(role.emitsRendererStopped).toBe(true)
    expect(sessionRoleReadyOutcome(role)).toMatchObject({
      status: "ok",
      evidence: { kind: "home-invariant" },
    })
    expect(typeof role.idleReadyEvidence()).toBe("string")
  })

  it("enters idle by masking ES, launching the renderer, and reconciling", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway, events: swayEvents } = makeSway([
      { id: 101, focused: true, fullscreen: true },
    ])
    const { serviceManager, events: svcEvents } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()

    expect(svcEvents).toEqual(["mask-es"])
    expect(rendererEvents).toEqual(["launch:101"])
    expect(swayEvents).toEqual(["sway:noop"])
    expect(role.rendererStatus().pid).toBe(101)
  })

  it("leaves idle by stopping the renderer and restoring ES", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager, events: svcEvents } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()
    rendererEvents.length = 0
    svcEvents.length = 0

    await role.leaveIdle()

    expect(rendererEvents).toEqual(["stop:101"])
    expect(svcEvents).toEqual(["restore-es"])
    expect(role.rendererStatus().pid).toBeUndefined()
  })

  it("beforeChildLaunch stops the renderer; restoreIdleAfterLaunch relaunches it", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()
    rendererEvents.length = 0

    await role.beforeChildLaunch()
    expect(rendererEvents).toEqual(["stop:101"])
    expect(role.rendererStatus().pid).toBeUndefined()

    await role.restoreIdleAfterLaunch()
    expect(rendererEvents).toEqual(["stop:101", "launch:102"])
    expect(role.rendererStatus().pid).toBe(102)
  })

  it("home-ready evidence describes a satisfied home-invariant when reconcile finds a compliant window", async () => {
    // task-015 AC #5: evidence is structured, not a fixed string.
    // "satisfied" appears only when no repair ran. This pins the
    // happy-path post-reconcile evidence shape so operators can
    // tell apart "already good" from "good after repair".
    const { renderer } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 7, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })
    await role.enterIdle()
    const outcome = sessionRoleReadyOutcome(role)
    expect(outcome).toMatchObject({
      status: "ok",
      evidence: {
        kind: "home-invariant",
        windowCount: 1,
        relaunchedRenderer: false,
        closedDuplicates: 0,
        repairedFocus: false,
        repairedFullscreen: false,
      },
    })
    if (outcome.status !== "ok") throw new Error("expected ok")
    expect(formatSessionRoleReadyEvidence(outcome.evidence)).toBe(
      "home-invariant windows=1 satisfied",
    )
    expect(role.idleReadyEvidence()).toBe("home-invariant windows=1 satisfied")
  })

  it("does not relaunch during idle entry while the renderer window is still mapping", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()

    expect(rendererEvents.filter(e => e.startsWith("launch:")).length).toBe(1)
    expect(role.idleReadyEvidence()).not.toContain("renderer-relaunched")
  })

  it("home-ready evidence reports duplicates-closed when multiple windows exist (task-015 AC #3/#5)", async () => {
    // AC #3: duplicate windows are closed while preserving a primary.
    // The decision and the apply step run during reconcile; the
    // evidence reflects the count so an operator can verify the
    // duplicate-close actually happened.
    const { renderer } = makeRecordingRenderer()
    const { sway, decisions } = makeSway([
      { id: 7, focused: true, fullscreen: true },
      { id: 9, focused: false, fullscreen: true },
      { id: 11, focused: false, fullscreen: true },
    ])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })
    await role.enterIdle()
    const close = decisions.find(d => d.kind === "close-duplicate-windows")
    if (close?.kind !== "close-duplicate-windows")
      throw new Error("expected duplicate-close decision")
    // Primary window is the focused one; duplicates are the rest.
    expect(close.primaryWindowId).toBe(7)
    expect(close.duplicateWindowIds).toEqual([9, 11])
    expect(role.idleReadyEvidence()).toContain("duplicates-closed=2")
  })

  it("home-ready evidence reports focus/fullscreen repair when window is non-compliant (task-015 AC #4/#5)", async () => {
    // AC #4: a non-fullscreen / non-focused window is repaired. The
    // evidence string surfaces both repair markers so a monitor can
    // distinguish "focus repair" from "fullscreen repair" from "both".
    const { renderer } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 7, focused: false, fullscreen: false }])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })
    await role.enterIdle()
    const evidence = role.idleReadyEvidence()
    expect(evidence).toContain("focus-repaired")
    expect(evidence).toContain("fullscreen-repaired")
    expect(evidence).not.toContain("satisfied")
  })

  it("relaunches the renderer during explicit reconcile when no window exists", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()
    await role.reconcileIdle()

    expect(rendererEvents.filter(e => e.startsWith("launch:")).length).toBe(2)
    expect(role.idleReadyEvidence()).toContain("renderer-relaunched")
  })

  // Phase 4D / Track A U3 -- afterChildRunning hook.

  it("exposes afterChildRunning as a no-op on the kiosk role", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway, events: swayEvents } = makeSway([])
    const { serviceManager, events: svcEvents } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()
    rendererEvents.length = 0
    swayEvents.length = 0
    svcEvents.length = 0

    await role.afterChildRunning({
      command: "/bin/game",
      args: ["rom.smc"],
    })

    // No-op contract: the kiosk role has no foreground surface to
    // promote because Electrobun owns the renderer. Calling it must
    // not touch the renderer, Sway, or the service manager.
    expect(rendererEvents).toEqual([])
    expect(swayEvents).toEqual([])
    expect(svcEvents).toEqual([])
  })
})

describe("lane-aware kiosk session role", () => {
  function makeLaneController(): {
    readonly laneController: KorriLaneController
    readonly events: string[]
  } {
    const events: string[] = []
    const laneController: KorriLaneController = {
      snapshot: () => ({
        lanes: { hub: "korri:hub", game: "korri:game:active" },
        activePlace: "hub",
        hub: { present: true },
        game: { status: "none" },
        generation: 0,
      }),
      beginLaunch: input => {
        events.push(`begin:${input.launchId}`)
      },
      handleSwayEvent: async () => {},
      toggleHome: async () => {
        events.push("toggle-home")
        return { status: "no-live-game" }
      },
      noteLaunchTimeout: async launchId => {
        events.push(`timeout:${launchId}`)
      },
      focusHub: async () => {
        events.push("focus-hub")
      },
    }
    return { laneController, events }
  }

  it("preserves the hub renderer and does not emit renderer-stopped semantics", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const { laneController } = makeLaneController()
    const role = createLaneAwareKioskSessionRole({
      renderer,
      sway,
      serviceManager,
      laneController,
    })

    await role.enterIdle()
    rendererEvents.length = 0

    expect(role.id).toBe("kiosk-lanes")
    expect(role.idleReadyEventName).toBe("home-ready")
    expect(role.emitsRendererStopped).toBe(false)

    await role.beforeChildLaunch()

    expect(rendererEvents).toEqual([])
    expect(role.rendererStatus().pid).toBe(101)
  })

  it("starts lane capture before the child is spawned", async () => {
    const { renderer } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const { laneController, events } = makeLaneController()
    const role = createLaneAwareKioskSessionRole({
      renderer,
      sway,
      serviceManager,
      laneController,
    })

    await role.beforeChildLaunch()
    await role.afterChildRunning({ command: "/bin/game", args: [] })

    expect(events).toEqual(["begin:managed-launch"])
  })

  it("fails before child launch while lane events are unavailable", async () => {
    const { renderer } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const { laneController, events } = makeLaneController()
    const role = createLaneAwareKioskSessionRole({
      renderer,
      sway,
      serviceManager,
      laneController,
      laneToggleAvailable: () => false,
    })

    await expect(role.beforeChildLaunch()).rejects.toThrow(
      "lane event source unavailable",
    )
    expect(events).toEqual([])
  })

  it("returns unsupported Home toggle while lane events are unavailable", async () => {
    const { renderer } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const { laneController, events } = makeLaneController()
    const role = createLaneAwareKioskSessionRole({
      renderer,
      sway,
      serviceManager,
      laneController,
      laneToggleAvailable: () => false,
    })

    expect(role.homeToggleAvailable?.()).toBe(false)
    expect(await role.toggleHome?.()).toEqual({ status: "unsupported" })
    expect(events).toEqual([])
  })

  it("restores by focusing hub and reconciling without relaunching an existing renderer", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([{ id: 101, focused: true, fullscreen: true }])
    const { serviceManager } = makeServiceManager()
    const { laneController, events: laneEvents } = makeLaneController()
    const role = createLaneAwareKioskSessionRole({
      renderer,
      sway,
      serviceManager,
      laneController,
    })

    await role.enterIdle()
    rendererEvents.length = 0

    await role.restoreIdleAfterLaunch()

    expect(laneEvents).toContain("timeout:managed-launch")
    expect(laneEvents).toContain("focus-hub")
    expect(rendererEvents).toEqual([])
    expect(role.idleReadyEvidence()).toBe("home-invariant windows=1 satisfied")
  })
})
