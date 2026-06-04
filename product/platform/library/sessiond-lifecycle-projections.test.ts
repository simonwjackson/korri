import { describe, expect, it } from "bun:test"
import { foregroundSessionGateStateFromSnapshot } from "@platform/stream/foreground-session-gate-state"
import {
  projectForegroundSessionStatusSnapshot,
  projectManagedLaunchStatus,
  projectSessiondLifecycleSummary,
  snapshotStateFromSessiondMode,
} from "./sessiond-lifecycle-projections"
import type { SessiondManagedLaunchMode } from "./sessiond-managed-launch-protocol"

describe("sessiond lifecycle projections", () => {
  it("projects internal home mode through the role idle alias", () => {
    const status = projectManagedLaunchStatus({
      mode: "home",
      idleModeLabel: "idle",
      active: { launchId: "launch-1", mode: "home" },
      restoreAttempts: 2,
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
        sessionLifecycle: true,
      },
    })

    expect(status).toMatchObject({
      schemaVersion: 1,
      mode: "idle",
      active: { launchId: "launch-1", mode: "idle" },
      restoreAttempts: 2,
    })
  })

  it("preserves active phase and failure reason in managed-launch status", () => {
    const status = projectManagedLaunchStatus({
      mode: "game",
      idleModeLabel: "home",
      active: { launchId: "launch-2", mode: "game" },
      phase: "wait-monitor",
      failureReason: "renderer failed",
      restoreAttempts: 1,
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: false,
        sessionLifecycle: true,
      },
    })

    expect(status).toMatchObject({
      mode: "game",
      active: { launchId: "launch-2", mode: "game", phase: "wait-monitor" },
      failureReason: "renderer failed",
      capabilities: { perLaunchTermination: false },
    })
  })

  it("projects app-server sessiond summary and applies failure redaction at the seam", () => {
    const summary = projectSessiondLifecycleSummary(
      {
        schemaVersion: 1,
        mode: "recovering",
        active: {
          launchId: "launch-3",
          mode: "recovering",
          phase: "restoring",
        },
        failureReason: "raw /tmp/private/path",
        restoreAttempts: 3,
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
      },
      {
        failureReason: value =>
          value.replace(/\/tmp\/private\/path/g, "<path>"),
      },
    )

    expect(summary).toEqual({
      mode: "recovering",
      active: { launchId: "launch-3", mode: "recovering", phase: "restoring" },
      failureReason: "raw <path>",
      restoreAttempts: 3,
    })
  })

  it("maps every sessiond mode to renderer snapshot vocabulary without Unknown gate state", () => {
    const expected: Record<SessiondManagedLaunchMode, string> = {
      stopped: "IdleReady",
      starting: "IdleReady",
      home: "IdleReady",
      idle: "IdleReady",
      launching: "Spawning",
      game: "Running",
      restoring: "TearingDown",
      recovering: "Recovering",
    }

    for (const mode of Object.keys(expected) as SessiondManagedLaunchMode[]) {
      expect(snapshotStateFromSessiondMode(mode)).toBe(expected[mode])
      const snapshot = projectForegroundSessionStatusSnapshot({
        sessiond: { mode, restoreAttempts: 0 },
        serverTimestamp: "2026-05-30T00:00:00.000Z",
      })
      expect(snapshot.state).toBe(expected[mode])
      expect(foregroundSessionGateStateFromSnapshot(snapshot)._tag).not.toBe(
        "Unknown",
      )
    }
  })

  it("projects active launch identity and failure reason into renderer snapshots", () => {
    const snapshot = projectForegroundSessionStatusSnapshot({
      sessiond: {
        mode: "game",
        active: { launchId: "launch-4", mode: "game" },
        failureReason: "recovering renderer",
        restoreAttempts: 1,
      },
      serverTimestamp: "2026-05-30T00:00:00.000Z",
    })

    expect(snapshot).toMatchObject({
      state: "Running",
      active: { requestId: "launch-4", gameId: "launch-4" },
      lastFailure: { stage: "sessiond", message: "recovering renderer" },
    })
  })

  it("projects an unconfigured sessiond summary as IdleReady", () => {
    expect(
      projectForegroundSessionStatusSnapshot({
        sessiond: undefined,
        serverTimestamp: "2026-05-30T00:00:00.000Z",
      }),
    ).toMatchObject({ state: "IdleReady", recentEvents: [] })
  })
})
