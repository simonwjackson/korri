import { describe, expect, it } from "bun:test"
import {
  createOverlaySessionProbe,
  isGameSessionActive,
} from "./overlay-session-state"
import type { SessiondManagedLaunchStatus } from "@platform/library/sessiond-managed-launch-protocol"

function status(
  overrides: Partial<SessiondManagedLaunchStatus>,
): SessiondManagedLaunchStatus {
  return {
    schemaVersion: 1,
    mode: "idle",
    capabilities: {
      managedLaunch: true,
      lifecycleEvents: true,
      perLaunchTermination: true,
    },
    restoreAttempts: 0,
    ...overrides,
  } as SessiondManagedLaunchStatus
}

describe("isGameSessionActive", () => {
  it("is false when status is null", () => {
    expect(isGameSessionActive(null)).toBe(false)
  })

  it("is false with no active launch", () => {
    expect(isGameSessionActive(status({ mode: "home" }))).toBe(false)
  })

  it("is false when the active launch is not in game mode", () => {
    expect(
      isGameSessionActive(
        status({ active: { launchId: "l1", mode: "launching" } }),
      ),
    ).toBe(false)
  })

  it("is true for an active game-mode launch", () => {
    expect(
      isGameSessionActive(
        status({ mode: "game", active: { launchId: "l1", mode: "game" } }),
      ),
    ).toBe(true)
  })
})

describe("createOverlaySessionProbe", () => {
  const gameStatus = status({
    mode: "game",
    active: { launchId: "l1", mode: "game" },
  })

  it("starts inactive before the first refresh", () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () => gameStatus,
      isMoonlightRunning: async () => true,
    })
    expect(probe.isActive()).toBe(false)
    expect(probe.isStream()).toBe(false)
  })

  it("reports an active local session (no moonlight)", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () => gameStatus,
      isMoonlightRunning: async () => false,
    })
    await probe.refresh()
    expect(probe.isActive()).toBe(true)
    expect(probe.isStream()).toBe(false)
  })

  it("reports a stream session when moonlight is running", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () => gameStatus,
      isMoonlightRunning: async () => true,
    })
    await probe.refresh()
    expect(probe.isActive()).toBe(true)
    expect(probe.isStream()).toBe(true)
  })

  it("does not probe moonlight when no session is active", async () => {
    let probed = false
    const probe = createOverlaySessionProbe({
      readStatus: async () => status({ mode: "home" }),
      isMoonlightRunning: async () => {
        probed = true
        return true
      },
    })
    await probe.refresh()
    expect(probe.isActive()).toBe(false)
    expect(probe.isStream()).toBe(false)
    expect(probed).toBe(false)
  })

  it("degrades to inactive when the status read throws", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () => {
        throw new Error("sessiond down")
      },
      isMoonlightRunning: async () => true,
    })
    await probe.refresh()
    expect(probe.isActive()).toBe(false)
    expect(probe.isStream()).toBe(false)
  })
})
