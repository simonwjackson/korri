import { describe, expect, it } from "bun:test"
import { observeSessiondManagedLaunchEvents } from "./sessiond-managed-launch-event-observer"
import type { SessiondManagedLaunchEvent } from "./sessiond-managed-launch-protocol"

function event(
  input: Omit<SessiondManagedLaunchEvent, "schemaVersion" | "at">,
): SessiondManagedLaunchEvent {
  return {
    schemaVersion: 1,
    at: "2026-05-26T00:00:00.000Z",
    ...input,
  }
}

function eventStream(events: readonly SessiondManagedLaunchEvent[]): Response {
  return eventStreamResponse(events, true)
}

function openEventStream(
  events: readonly SessiondManagedLaunchEvent[],
): Response {
  return eventStreamResponse(events, false)
}

function eventStreamResponse(
  events: readonly SessiondManagedLaunchEvent[],
  close: boolean,
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        for (const item of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(item)}\n\n`),
          )
        }
        if (close) controller.close()
      },
    }),
  )
}

describe("sessiond managed-launch event observer", () => {
  it("resolves home-ready after child exit", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-1",
      fetchImpl: async () =>
        eventStream([
          event({ sequence: 1, launchId: "launch-1", type: "child-running" }),
          event({
            sequence: 2,
            launchId: "launch-1",
            type: "child-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 3,
            launchId: "launch-1",
            type: "home-ready",
            readiness: { status: "ok" },
          }),
        ]),
    })

    expect(await observer.exited).toEqual({ exitCode: 0 })
    expect(await observer.ready).toEqual({
      status: "ok",
      evidence: { gate: "sessiond-home-ready" },
    })
    expect(await observer.result).toEqual({ status: "launched" })
  })

  it("resolves idle-ready with the source-machine gate", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-2",
      fetchImpl: async () =>
        eventStream([
          event({
            sequence: 1,
            launchId: "launch-2",
            type: "child-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 2,
            launchId: "launch-2",
            type: "idle-ready",
            readiness: { status: "ok" },
          }),
        ]),
    })

    expect(await observer.ready).toEqual({
      status: "ok",
      evidence: { gate: "sessiond-idle-ready" },
    })
    expect(await observer.result).toEqual({ status: "launched" })
  })

  it("ignores events for other launch ids", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-target",
      fetchImpl: async () =>
        eventStream([
          event({
            sequence: 1,
            launchId: "launch-other",
            type: "child-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 2,
            launchId: "launch-target",
            type: "child-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 3,
            launchId: "launch-target",
            type: "home-ready",
            readiness: { status: "ok" },
          }),
        ]),
    })

    expect(await observer.exited).toEqual({ exitCode: 0 })
    expect(await observer.result).toEqual({ status: "launched" })
  })

  it("reconnects when the event stream closes before a terminal event", async () => {
    let requestCount = 0
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-rc",
      fetchImpl: async () => {
        requestCount += 1
        if (requestCount === 1) {
          return eventStream([
            event({
              sequence: 1,
              launchId: "launch-rc",
              type: "child-running",
            }),
          ])
        }
        return eventStream([
          event({
            sequence: 2,
            launchId: "launch-rc",
            type: "child-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 3,
            launchId: "launch-rc",
            type: "home-ready",
            readiness: { status: "ok" },
          }),
        ])
      },
    })

    expect(await observer.result).toEqual({ status: "launched" })
    expect(requestCount).toBeGreaterThanOrEqual(2)
  })

  it("fails when the event stream is rejected", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-1",
      fetchImpl: async () => new Response(null, { status: 500 }),
    })

    expect(await observer.ready).toMatchObject({
      status: "failed",
      message: expect.stringContaining("sessiond event stream rejected: 500"),
    })
    expect(await observer.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
    })
  })

  it("fails when readiness never arrives after child exit", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-1",
      requestTimeoutMs: 20,
      fetchImpl: async () =>
        openEventStream([
          event({
            sequence: 1,
            launchId: "launch-1",
            type: "child-exited",
            terminal: { exitCode: 0 },
          }),
        ]),
    })

    expect(await observer.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
      stderrTail: "sessiond event stream timed out before readiness",
    })
  })

  it("maps recovering events to host-unavailable failure", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-1",
      fetchImpl: async () =>
        eventStream([
          event({
            sequence: 1,
            launchId: "launch-1",
            type: "recovering",
            message: "renderer failed",
          }),
        ]),
    })

    expect(await observer.exited).toEqual({ exitCode: null })
    expect(await observer.result).toMatchObject({
      status: "failed",
      failureKind: "host-unavailable",
      stderrTail: "renderer failed",
    })
  })

  it("uses wait-monitor-exited as the terminal event for session lifecycle", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-7",
      fetchImpl: async () =>
        eventStream([
          event({
            sequence: 1,
            launchId: "launch-7",
            type: "launcher-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 2,
            launchId: "launch-7",
            type: "wait-monitor-exited",
            terminal: { exitCode: 137, failureKind: "command-failed" },
          }),
          event({
            sequence: 3,
            launchId: "launch-7",
            type: "idle-ready",
            readiness: { status: "ok" },
          }),
        ]),
    })

    expect(await observer.exited).toEqual({ exitCode: 137 })
    expect(await observer.result).toMatchObject({
      status: "failed",
      exitCode: 137,
      failureKind: "command-failed",
    })
  })

  it("settles anchored sessions from cached launcher terminal when terminated", async () => {
    const observer = observeSessiondManagedLaunchEvents({
      url: "http://127.0.0.1:3003",
      token: "secret",
      launchId: "launch-9",
      fetchImpl: async () =>
        eventStream([
          event({
            sequence: 1,
            launchId: "launch-9",
            type: "launcher-exited",
            terminal: { exitCode: 0 },
          }),
          event({
            sequence: 2,
            launchId: "launch-9",
            type: "session-anchored",
            readiness: { status: "ok" },
          }),
          event({ sequence: 3, launchId: "launch-9", type: "terminated" }),
          event({
            sequence: 4,
            launchId: "launch-9",
            type: "idle-ready",
            readiness: { status: "ok" },
          }),
        ]),
    })

    expect(await observer.exited).toEqual({ exitCode: 0 })
    expect(await observer.result).toEqual({ status: "launched" })
  })
})
