import { describe, expect, it } from "bun:test"
import type { KorriSessiondServiceManager } from "./sessiond"
import type { KorriRendererController } from "./sessiond-renderer"
import { createKioskSessionRole } from "./sessiond-role"
import type { KorriWindowSnapshot } from "./sessiond-state"
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
} {
  const events: string[] = []
  const windows = [...initialWindows]
  const sway: SwayController = {
    getKorriWindows: async () => windows,
    applyDecisions: async decisions => {
      events.push(...decisions.map(decision => `sway:${decision.kind}`))
      return []
    },
  }
  return { sway, events }
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
