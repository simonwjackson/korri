import { describe, expect, it } from "bun:test"
import type { KorriSessiondServiceManager } from "./sessiond"
import type { KorriRendererController } from "./sessiond-renderer"
import { createKioskSessionRole } from "./sessiond-role"
import type { HomeInvariantDecision, KorriWindowSnapshot } from "./sessiond-state"
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
    expect(role.idleReadyEvidence()).toBe(
      "home-invariant windows=1 satisfied",
    )
  })

  it("home-ready evidence reports renderer-relaunched after a missing-window repair (task-015 AC #2/#5)", async () => {
    // AC #2: a missing window must trigger relaunch BEFORE
    // home-ready evidence reports "satisfied". This test exercises
    // both halves: the renderer is launched (relaunch), and the
    // resulting evidence string carries the "renderer-relaunched"
    // marker so the readiness event is honest about what just
    // happened.
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })
    await role.enterIdle()
    // enterIdle launches once + reconcile sees no windows and
    // relaunches a second time. Both launches must happen before
    // evidence is generated.
    expect(rendererEvents.filter(e => e.startsWith("launch:")).length).toBe(2)
    expect(role.idleReadyEvidence()).toContain("renderer-relaunched")
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

  it("relaunches the renderer during reconcile when no window exists", async () => {
    const { renderer, events: rendererEvents } = makeRecordingRenderer()
    const { sway } = makeSway([])
    const { serviceManager } = makeServiceManager()
    const role = createKioskSessionRole({ renderer, sway, serviceManager })

    await role.enterIdle()

    expect(rendererEvents.filter(e => e.startsWith("launch:")).length).toBe(2)
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
    // promote because Electrobun owns the renderer and Gamescope is
    // not in the kiosk path. Calling it must not touch the renderer,
    // Sway, or the service manager.
    expect(rendererEvents).toEqual([])
    expect(swayEvents).toEqual([])
    expect(svcEvents).toEqual([])
  })
})
