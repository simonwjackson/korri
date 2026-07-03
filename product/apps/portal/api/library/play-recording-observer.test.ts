import { describe, expect, it } from "bun:test"

import { createInMemoryPlayLogStore } from "@platform/library/play-log-store"
import type { ForegroundSessionState } from "@platform/stream/foreground-session-lifecycle"

import { createPlayRecordingObserver } from "./play-recording-observer"

const active = { requestId: "req-1", gameId: "snes/f-zero" } as const
const running: ForegroundSessionState = { _tag: "Running", active }
const exitObserved: ForegroundSessionState = { _tag: "ExitObserved", active }

function clock(...isoTimes: readonly string[]): () => Date {
  const queue = [...isoTimes]
  return () => new Date(queue.shift() ?? isoTimes[isoTimes.length - 1] ?? 0)
}

describe("createPlayRecordingObserver", () => {
  it("records one entry on ExitObserved with the running-to-exit duration", async () => {
    const store = createInMemoryPlayLogStore()
    const observer = createPlayRecordingObserver({
      store,
      now: clock("2026-07-01T20:00:00.000Z", "2026-07-01T20:30:00.000Z"),
    })

    await observer.onStateEntered(running)
    await observer.onStateEntered(exitObserved)

    const log = await store.load("snes/f-zero")
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.durationSeconds).toBe(1800)
    expect(log.entries[0]?.occurredAt.toISOString()).toBe(
      "2026-07-01T20:30:00.000Z",
    )
  })

  it("does not record when the session never reached Running", async () => {
    const store = createInMemoryPlayLogStore()
    const observer = createPlayRecordingObserver({ store })

    await observer.onStateEntered(exitObserved)

    expect((await store.load("snes/f-zero")).entries).toHaveLength(0)
  })

  it("applies the gate: a sub-threshold session is not recorded", async () => {
    const store = createInMemoryPlayLogStore()
    const observer = createPlayRecordingObserver({
      store,
      thresholdSeconds: 120,
      now: clock("2026-07-01T20:00:00.000Z", "2026-07-01T20:00:30.000Z"),
    })

    await observer.onStateEntered(running)
    await observer.onStateEntered(exitObserved)

    expect((await store.load("snes/f-zero")).entries).toHaveLength(0)
  })
})
