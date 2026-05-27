import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  decodeSessiondManagedLaunchEvent,
  decodeSessiondManagedLaunchStatus,
  SessiondManagedLaunchEvent,
  SessiondManagedLaunchStartRequest,
  SessiondManagedLaunchStartResponse,
  SessiondManagedLaunchStatus,
  SessiondManagedLaunchTerminateRequest,
  SessiondManagedLaunchTerminateResponse,
} from "./sessiond-managed-launch-protocol"

describe("sessiond managed launch protocol", () => {
  it("decodes managed launch command and response payloads", () => {
    const request = Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: ["rom.smc"] },
    })
    expect(request).toEqual({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: ["rom.smc"] },
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
})
