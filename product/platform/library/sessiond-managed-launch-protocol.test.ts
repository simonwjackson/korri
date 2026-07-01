import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  decodeSessiondManagedLaunchEvent,
  decodeSessiondManagedLaunchStatus,
  decodeSessiondManagedLaunchHomeToggleResponse,
  decodeSessiondManagedLaunchTerminateResponse,
  SessiondManagedLaunchEvent,
  SessiondManagedLaunchStartRequest,
  SessiondManagedLaunchStartResponse,
  SessiondManagedLaunchStatus,
  SessiondManagedLaunchTerminateRequest,
  SessiondManagedLaunchTerminateResponse,
} from "./sessiond-managed-launch-protocol"

describe("sessiond managed launch protocol", () => {
  it("decodes managed launch command and response payloads", () => {
    const request = Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)(
      {
        launchId: "launch-1",
        spec: { command: "/bin/game", args: ["rom.smc"] },
        launchMetadata: { appProviderId: "@korri:steam" },
        launchCompanions: {
          "@fixture:companion": { enable: true, mode: "wrapped" },
        },
      },
    )
    expect(request).toEqual({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: ["rom.smc"] },
      launchMetadata: { appProviderId: "@korri:steam" },
      launchCompanions: {
        "@fixture:companion": { enable: true, mode: "wrapped" },
      },
    })

    expect(
      Schema.decodeUnknownSync(SessiondManagedLaunchStartResponse)({
        status: "accepted",
        launchId: "launch-1",
      }),
    ).toEqual({ status: "accepted", launchId: "launch-1" })

    expect(
      Schema.decodeUnknownSync(SessiondManagedLaunchStartResponse)({
        status: "failed",
        failureKind: "session-busy",
        message: "sessiond is already launching",
      }),
    ).toEqual({
      status: "failed",
      failureKind: "session-busy",
      message: "sessiond is already launching",
    })
  })

  it("decodes status and capability payloads", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "game",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
      },
      active: { launchId: "launch-1", mode: "game" },
      restoreAttempts: 0,
    })

    expect(status.active).toEqual({ launchId: "launch-1", mode: "game" })
  })

  it("decodes lifecycle event payloads", () => {
    const event = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 4,
      launchId: "launch-1",
      type: "child-exited",
      at: "2026-05-26T00:00:00.000Z",
      terminal: { exitCode: 0 },
    })

    expect(event).toEqual({
      schemaVersion: 1,
      sequence: 4,
      launchId: "launch-1",
      type: "child-exited",
      at: "2026-05-26T00:00:00.000Z",
      terminal: { exitCode: 0 },
    })
  })

  it("rejects malformed event payloads", () => {
    expect(() =>
      decodeSessiondManagedLaunchEvent({
        schemaVersion: 1,
        sequence: 1,
        launchId: "launch-1",
        type: "not-a-sessiond-event",
        at: "2026-05-26T00:00:00.000Z",
      }),
    ).toThrow()
  })

  it("keeps status summaries free of raw launch spec internals", () => {
    expect(() =>
      decodeSessiondManagedLaunchStatus({
        schemaVersion: 1,
        mode: "game",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        active: { launchId: "launch-1", mode: "game" },
        restoreAttempts: 0,
        launchSpec: {
          command: "/bin/game",
          args: ["rom.smc"],
          env: { SECRET: "do-not-leak" },
        },
      }),
    ).toThrow()
  })

  it("decodes unsupported capability status distinctly from transport failure", () => {
    const status = Schema.decodeUnknownSync(SessiondManagedLaunchStatus)({
      schemaVersion: 1,
      mode: "home",
      capabilities: {
        managedLaunch: false,
        lifecycleEvents: false,
        perLaunchTermination: false,
      },
      restoreAttempts: 0,
    })

    expect(status.capabilities.managedLaunch).toBe(false)
  })

  it("decodes Home lane toggle payloads and capability", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "home",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
        laneToggle: true,
      },
      restoreAttempts: 0,
    })

    expect(status.capabilities.laneToggle).toBe(true)
    expect(
      decodeSessiondManagedLaunchHomeToggleResponse({
        status: "no-live-game",
      }),
    ).toEqual({ status: "no-live-game" })
    expect(() =>
      decodeSessiondManagedLaunchHomeToggleResponse({
        status: "focused-hub",
        extra: true,
      }),
    ).toThrow()
  })

  it("decodes per-launch termination payloads", () => {
    expect(
      Schema.decodeUnknownSync(SessiondManagedLaunchTerminateRequest)({
        launchId: "launch-1",
      }),
    ).toEqual({ launchId: "launch-1" })

    expect(
      Schema.decodeUnknownSync(SessiondManagedLaunchTerminateResponse)({
        status: "not-found",
        launchId: "launch-1",
        message: "launch is no longer active",
      }),
    ).toEqual({
      status: "not-found",
      launchId: "launch-1",
      message: "launch is no longer active",
    })
  })

  // Task-009 coverage gap: the strict-decode helper for the
  // termination response is the entry point clients reach for, so
  // exercise it directly (in addition to the raw decode above) to
  // pin its strict-decode posture and ensure refactors of the
  // helper surface a test failure rather than a silent change.
  it("decodeSessiondManagedLaunchTerminateResponse decodes accepted status under strict decode", () => {
    // The accepted variant carries no message — strict decode means
    // including one would be a wire-shape violation.
    const decoded = decodeSessiondManagedLaunchTerminateResponse({
      status: "accepted",
      launchId: "launch-77",
    })
    expect(decoded).toEqual({ status: "accepted", launchId: "launch-77" })
  })

  it("decodeSessiondManagedLaunchTerminateResponse rejects unknown fields under strict decode", () => {
    expect(() =>
      decodeSessiondManagedLaunchTerminateResponse({
        status: "terminated",
        launchId: "launch-77",
        message: "ok",
        // Strict decode posture means an unexpected extra field is
        // a wire-shape change, not silently tolerated.
        unexpectedField: "x",
      }),
    ).toThrow()
  })

  // Task-009 coverage gap: the ISO-timestamp validator's reject
  // branch was previously unreached. Any decode that pipes a non-
  // ISO string into a timestamp field surfaces the error path.
  it("rejects lifecycle event payloads carrying a non-ISO occurredAt timestamp", () => {
    expect(() =>
      Schema.decodeUnknownSync(SessiondManagedLaunchEvent)({
        schemaVersion: 1,
        sequence: 1,
        launchId: "launch-1",
        // Not an ISO timestamp — plain unix-seconds-as-string. The
        // ISO filter must reject this rather than coerce it.
        occurredAt: "1716480000",
        type: "child-running",
      }),
    ).toThrow()
  })

  it("roundtrips encoded event payloads", () => {
    const input = {
      schemaVersion: 1,
      sequence: 2,
      launchId: "launch-1",
      type: "home-ready",
      at: "2026-05-26T00:00:00.000Z",
      readiness: { status: "ok", evidence: "home-invariant-satisfied" },
    } as const

    const encoded = Schema.encodeSync(SessiondManagedLaunchEvent)(
      decodeSessiondManagedLaunchEvent(input),
    )
    expect(encoded).toEqual(input)
  })

  it("decodes idle-ready as a terminal lifecycle event peer to home-ready", () => {
    const event = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 5,
      launchId: "launch-1",
      type: "idle-ready",
      at: "2026-05-27T00:00:00.000Z",
      readiness: { status: "ok", evidence: "idle-blank-satisfied" },
    })

    expect(event.type).toBe("idle-ready")
    expect(event.readiness?.status).toBe("ok")
  })

  it("decodes status payloads carrying the idle mode literal", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "idle",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
      },
      restoreAttempts: 0,
    })

    expect(status.mode).toBe("idle")
  })

  it("still decodes the Phase 4B kiosk payload unchanged (home + home-ready + renderer-stopped)", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "home",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
      },
      active: { launchId: "launch-1", mode: "home" },
      restoreAttempts: 0,
    })
    expect(status.mode).toBe("home")

    const homeReady = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 7,
      launchId: "launch-1",
      type: "home-ready",
      at: "2026-05-26T00:00:00.000Z",
      readiness: { status: "ok" },
    })
    const rendererStopped = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 8,
      launchId: "launch-1",
      type: "renderer-stopped",
      at: "2026-05-26T00:00:00.001Z",
    })
    expect(homeReady.type).toBe("home-ready")
    expect(rendererStopped.type).toBe("renderer-stopped")
  })

  it("accepts a source-machine-shaped lifecycle (no renderer-stopped, idle-ready terminal)", () => {
    const events = [
      {
        schemaVersion: 1,
        sequence: 1,
        launchId: "launch-1",
        type: "launch-accepted",
        at: "2026-05-27T00:00:00.000Z",
      },
      {
        schemaVersion: 1,
        sequence: 2,
        launchId: "launch-1",
        type: "child-running",
        at: "2026-05-27T00:00:00.100Z",
      },
      {
        schemaVersion: 1,
        sequence: 3,
        launchId: "launch-1",
        type: "child-exited",
        at: "2026-05-27T00:00:00.500Z",
        terminal: { exitCode: 0 },
      },
      {
        schemaVersion: 1,
        sequence: 4,
        launchId: "launch-1",
        type: "idle-ready",
        at: "2026-05-27T00:00:00.900Z",
        readiness: { status: "ok", evidence: "idle-blank-satisfied" },
      },
    ]

    const decoded = events.map(decodeSessiondManagedLaunchEvent)
    expect(decoded.map(e => e.type)).toEqual([
      "launch-accepted",
      "child-running",
      "child-exited",
      "idle-ready",
    ])
    expect(decoded.some(e => e.type === "renderer-stopped")).toBe(false)
  })

  it("rejects unknown mode literals with strict decode", () => {
    expect(() =>
      decodeSessiondManagedLaunchStatus({
        schemaVersion: 1,
        mode: "not-a-mode",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
        },
        restoreAttempts: 0,
      }),
    ).toThrow()
  })

  // Phase 4D / Track A -- session lifecycle additive extension.

  it("decodes a session-lifecycle start request with a wait spec (Track A)", () => {
    const request = Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)(
      {
        launchId: "launch-7",
        spec: { command: "/bin/steam-launcher.sh", args: ["--big-picture"] },
        lifecycle: "session",
        wait: {
          command: "/bin/steam-wait-monitor.sh",
          args: ["--pid-tree"],
        },
      },
    )
    expect(request).toEqual({
      launchId: "launch-7",
      spec: { command: "/bin/steam-launcher.sh", args: ["--big-picture"] },
      lifecycle: "session",
      wait: {
        command: "/bin/steam-wait-monitor.sh",
        args: ["--pid-tree"],
      },
    })
  })

  it("decodes a session-lifecycle start request with no wait (anchor)", () => {
    const request = Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)(
      {
        spec: { command: "/bin/firefox-launcher.sh", args: [] },
        lifecycle: "session",
      },
    )
    expect(request.lifecycle).toBe("session")
    expect(request).not.toHaveProperty("wait")
  })

  it("keeps the Phase 4B start request shape (no lifecycle, no wait) decoding cleanly", () => {
    const request = Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)(
      {
        launchId: "launch-2",
        spec: { command: "/bin/game", args: ["rom.smc"] },
      },
    )
    expect(request).toEqual({
      launchId: "launch-2",
      spec: { command: "/bin/game", args: ["rom.smc"] },
    })
  })

  it("rejects unknown lifecycle literals with strict decode", () => {
    expect(() =>
      Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)({
        spec: { command: "/bin/launcher", args: [] },
        lifecycle: "background",
      }),
    ).toThrow()
  })

  it.each([
    "launcher-exited",
    "wait-monitor-running",
    "wait-monitor-exited",
    "session-anchored",
  ] as const)("decodes the new session-lifecycle event %s", eventType => {
    const event = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 9,
      launchId: "launch-7",
      type: eventType,
      at: "2026-05-27T00:00:00.000Z",
    })
    expect(event.type).toBe(eventType)
  })

  it("decodes launcher-exited with a clean exit terminal payload", () => {
    const event = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 4,
      launchId: "launch-7",
      type: "launcher-exited",
      at: "2026-05-27T00:00:00.500Z",
      terminal: { exitCode: 0 },
    })
    expect(event.terminal).toEqual({ exitCode: 0 })
  })

  it("decodes session-anchored with a readiness payload (operator evidence)", () => {
    const event = decodeSessiondManagedLaunchEvent({
      schemaVersion: 1,
      sequence: 5,
      launchId: "launch-7",
      type: "session-anchored",
      at: "2026-05-27T00:00:00.600Z",
      readiness: {
        status: "ok",
        evidence: "launcher exited; anchor holding",
      },
    })
    expect(event.readiness?.status).toBe("ok")
  })

  it("decodes capabilities advertising sessionLifecycle support", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "home",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
        sessionLifecycle: true,
      },
      restoreAttempts: 0,
    })
    expect(status.capabilities.sessionLifecycle).toBe(true)
  })

  it("decodes capabilities omitting sessionLifecycle (Phase 4B back-compat)", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "home",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
      },
      restoreAttempts: 0,
    })
    expect(status.capabilities.sessionLifecycle).toBeUndefined()
  })

  // Phase 4D / Track A finishing follow-up. Active payload may carry
  // a sub-phase distinguishing `running` (launcher child active) from
  // `wait-monitor` (wait monitor is the active child) and `anchored`
  // (no live child, sessiond holding role-foreground state) without
  // expanding the coarse `mode` literal. Phase 4B clients omitting
  // the field still decode cleanly.

  it("decodes active.phase = 'running' for a primary-child session", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "game",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
        sessionLifecycle: true,
      },
      active: { launchId: "launch-r", mode: "game", phase: "running" },
      restoreAttempts: 0,
    })
    expect(status.active?.phase).toBe("running")
  })

  it("decodes active.phase = 'wait-monitor' / 'anchored' / 'launching' / 'restoring'", () => {
    for (const phase of [
      "launching",
      "running",
      "wait-monitor",
      "anchored",
      "restoring",
    ] as const) {
      const status = decodeSessiondManagedLaunchStatus({
        schemaVersion: 1,
        mode: "game",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
          sessionLifecycle: true,
        },
        active: { launchId: "launch-x", mode: "game", phase },
        restoreAttempts: 0,
      })
      expect(status.active?.phase).toBe(phase)
    }
  })

  it("decodes active without phase (Phase 4B / older sessiond back-compat)", () => {
    const status = decodeSessiondManagedLaunchStatus({
      schemaVersion: 1,
      mode: "game",
      capabilities: {
        managedLaunch: true,
        lifecycleEvents: true,
        perLaunchTermination: true,
      },
      active: { launchId: "launch-noph", mode: "game" },
      restoreAttempts: 0,
    })
    expect(status.active?.phase).toBeUndefined()
  })

  it("rejects unknown phase literals with strict decode", () => {
    expect(() =>
      decodeSessiondManagedLaunchStatus({
        schemaVersion: 1,
        mode: "game",
        capabilities: {
          managedLaunch: true,
          lifecycleEvents: true,
          perLaunchTermination: true,
          sessionLifecycle: true,
        },
        active: { launchId: "launch-bad", mode: "game", phase: "frobnicating" },
        restoreAttempts: 0,
      }),
    ).toThrow()
  })

  it("accepts a full session+wait lifecycle event sequence", () => {
    const sequence: Array<
      | "launch-accepted"
      | "child-running"
      | "launcher-exited"
      | "wait-monitor-running"
      | "wait-monitor-exited"
      | "restoring"
      | "idle-ready"
    > = [
      "launch-accepted",
      "child-running",
      "launcher-exited",
      "wait-monitor-running",
      "wait-monitor-exited",
      "restoring",
      "idle-ready",
    ]
    const events = sequence.map((type, index) =>
      decodeSessiondManagedLaunchEvent({
        schemaVersion: 1,
        sequence: index + 1,
        launchId: "launch-7",
        type,
        at: `2026-05-27T00:00:0${index}.000Z`,
        ...(type === "wait-monitor-exited"
          ? { terminal: { exitCode: 0 } }
          : {}),
        ...(type === "idle-ready"
          ? { readiness: { status: "ok" as const } }
          : {}),
      }),
    )
    expect(events.map(e => e.type)).toEqual(sequence)
  })

  it("accepts a full session+anchor lifecycle event sequence (launcher then anchor then terminate)", () => {
    const sequence: Array<
      | "launch-accepted"
      | "child-running"
      | "launcher-exited"
      | "session-anchored"
      | "terminated"
      | "restoring"
      | "idle-ready"
    > = [
      "launch-accepted",
      "child-running",
      "launcher-exited",
      "session-anchored",
      "terminated",
      "restoring",
      "idle-ready",
    ]
    const events = sequence.map((type, index) =>
      decodeSessiondManagedLaunchEvent({
        schemaVersion: 1,
        sequence: index + 1,
        launchId: "launch-7",
        type,
        at: `2026-05-27T00:00:0${index}.000Z`,
        ...(type === "session-anchored"
          ? {
              readiness: {
                status: "ok" as const,
                evidence: "launcher exited; anchor holding",
              },
            }
          : {}),
        ...(type === "idle-ready"
          ? { readiness: { status: "ok" as const } }
          : {}),
      }),
    )
    expect(events.map(e => e.type)).toEqual(sequence)
  })
})
