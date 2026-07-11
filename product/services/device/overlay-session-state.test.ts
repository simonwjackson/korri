import { describe, expect, it } from "bun:test"
import type { SessiondManagedLaunchStatus } from "@platform/library/sessiond-managed-launch-protocol"
import {
  createOverlaySessionProbe,
  isGameSessionActive,
  streamSourceControlUrlFromStatus,
} from "./overlay-session-state"

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
    expect(probe.sourceControlUrl()).toBeUndefined()
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

  it("reports frozen state and freeze availability for a local session", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () =>
        status({
          mode: "game",
          capabilities: {
            managedLaunch: true,
            lifecycleEvents: true,
            perLaunchTermination: true,
            launchFreeze: true,
          },
          active: { launchId: "l1", mode: "game", phase: "frozen" },
        }),
      isMoonlightRunning: async () => false,
    })
    await probe.refresh()
    expect(probe.isFrozen()).toBe(true)
    expect(probe.freezeAvailable()).toBe(true)
    expect(probe.activeLaunchId()).toBe("l1")
  })

  it("reports freeze unavailable when the capability is absent on a local session", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () => gameStatus,
      isMoonlightRunning: async () => false,
    })
    await probe.refresh()
    expect(probe.freezeAvailable()).toBe(false)
    expect(probe.isFrozen()).toBe(false)
  })

  it("derives stream frozen state from the host reader, not the local phase", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () =>
        status({
          mode: "game",
          active: {
            launchId: "l1",
            mode: "game",
            phase: "running",
            launchMetadata: {
              annotations: {
                "@korri:stream": { controlUrl: "http://aka:3001" },
              },
            },
          },
        }),
      isMoonlightRunning: async () => true,
      readRemoteFreeze: async controlUrl =>
        controlUrl === "http://aka:3001"
          ? { freezeCapable: true, frozen: true }
          : null,
    })
    await probe.refresh()
    expect(probe.isStream()).toBe(true)
    expect(probe.isFrozen()).toBe(true)
    expect(probe.freezeAvailable()).toBe(true)
  })

  it("hides the stream freeze option when the host does not advertise the capability", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () =>
        status({
          mode: "game",
          active: {
            launchId: "l1",
            mode: "game",
            launchMetadata: {
              annotations: {
                "@korri:stream": { controlUrl: "http://aka:3001" },
              },
            },
          },
        }),
      isMoonlightRunning: async () => true,
      readRemoteFreeze: async () => ({ freezeCapable: false, frozen: null }),
    })
    await probe.refresh()
    expect(probe.isStream()).toBe(true)
    expect(probe.freezeAvailable()).toBe(false)
  })

  it("does not offer freeze for a stream without a source control URL", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () =>
        status({
          mode: "game",
          active: { launchId: "l1", mode: "game" },
        }),
      isMoonlightRunning: async () => true,
    })
    await probe.refresh()
    expect(probe.isStream()).toBe(true)
    // Without a controlUrl the remote route can only skip; the toggle would
    // be a dead control.
    expect(probe.freezeAvailable()).toBe(false)
  })

  it("applies noteRemoteFrozen immediately and falls back to it when the host read fails", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () =>
        status({
          mode: "game",
          active: {
            launchId: "l1",
            mode: "game",
            launchMetadata: {
              annotations: {
                "@korri:stream": { controlUrl: "http://aka:3001" },
              },
            },
          },
        }),
      isMoonlightRunning: async () => true,
      readRemoteFreeze: async () => null,
    })
    await probe.refresh()
    expect(probe.isFrozen()).toBe(false)
    // Unknown capability stays optimistic until the host answers.
    expect(probe.freezeAvailable()).toBe(true)
    probe.noteRemoteFrozen(true)
    expect(probe.isFrozen()).toBe(true)
    await probe.refresh()
    // Host read returned null (unknown): last known outcome wins.
    expect(probe.isFrozen()).toBe(true)
  })

  it("caches the stream source control URL from active launch metadata", async () => {
    const probe = createOverlaySessionProbe({
      readStatus: async () =>
        status({
          mode: "game",
          active: {
            launchId: "l1",
            mode: "game",
            launchMetadata: {
              annotations: {
                "@korri:stream": { controlUrl: "http://aka:3001" },
              },
            },
          },
        }),
      isMoonlightRunning: async () => true,
    })
    await probe.refresh()
    expect(probe.sourceControlUrl()).toBe("http://aka:3001")
  })

  it("extracts a stream source control URL from status metadata", () => {
    expect(
      streamSourceControlUrlFromStatus(
        status({
          mode: "game",
          active: {
            launchId: "l1",
            mode: "game",
            launchMetadata: {
              annotations: {
                "@korri:stream": { controlUrl: " http://aka:3001 " },
              },
            },
          },
        }),
      ),
    ).toBe("http://aka:3001")
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
