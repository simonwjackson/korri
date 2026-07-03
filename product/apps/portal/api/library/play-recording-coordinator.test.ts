import { describe, expect, it } from "bun:test"

import { DEFAULT_USER_ID } from "@platform/library/config/records/user"
import { createInMemoryPlayLogStore } from "@platform/library/play-log-store"

import { createPlayRecordingCoordinator } from "./play-recording-coordinator"

const key = (gameId: string) => ({ userId: DEFAULT_USER_ID, gameId })

const context = (over: Partial<Parameters<
  ReturnType<typeof createPlayRecordingCoordinator>["beginLaunch"]
>[0]> = {}) => ({
  launchId: "launch-1",
  userId: DEFAULT_USER_ID,
  gameId: "snes/f-zero",
  startedAt: new Date("2026-07-01T20:00:00.000Z"),
  ...over,
})

describe("createPlayRecordingCoordinator", () => {
  it("records one entry on completeLaunch with the begin-to-end duration and release tag", async () => {
    const store = createInMemoryPlayLogStore()
    const coordinator = createPlayRecordingCoordinator({ store })

    coordinator.beginLaunch(context({ releaseId: "steam" }))
    const recorded = await coordinator.completeLaunch(
      "launch-1",
      new Date("2026-07-01T20:30:00.000Z"),
    )

    expect(recorded).toBe(true)
    const log = await store.load(key("snes/f-zero"))
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.durationSeconds).toBe(1800)
    expect(log.entries[0]?.releaseId).toBe("steam")
    expect(log.entries[0]?.occurredAt.toISOString()).toBe(
      "2026-07-01T20:30:00.000Z",
    )
  })

  it("records nothing when completing an unknown launch", async () => {
    const store = createInMemoryPlayLogStore()
    const coordinator = createPlayRecordingCoordinator({ store })
    expect(await coordinator.completeLaunch("no-such-launch")).toBe(false)
    expect((await store.load(key("snes/f-zero"))).entries).toHaveLength(0)
  })

  it("gates a sub-threshold session out", async () => {
    const store = createInMemoryPlayLogStore()
    const coordinator = createPlayRecordingCoordinator({
      store,
      thresholdSeconds: 120,
    })
    coordinator.beginLaunch(context())
    const recorded = await coordinator.completeLaunch(
      "launch-1",
      new Date("2026-07-01T20:00:30.000Z"),
    )
    expect(recorded).toBe(false)
    expect((await store.load(key("snes/f-zero"))).entries).toHaveLength(0)
  })

  it("is idempotent per launchId — a second completion records nothing", async () => {
    const store = createInMemoryPlayLogStore()
    const coordinator = createPlayRecordingCoordinator({ store })
    coordinator.beginLaunch(context())
    await coordinator.completeLaunch("launch-1", new Date("2026-07-01T20:10:00.000Z"))
    const second = await coordinator.completeLaunch(
      "launch-1",
      new Date("2026-07-01T20:20:00.000Z"),
    )
    expect(second).toBe(false)
    expect((await store.load(key("snes/f-zero"))).entries).toHaveLength(1)
  })

  it("swallows store errors so teardown is never broken", async () => {
    let seen: unknown
    const failing = {
      load: async () => ({ userId: DEFAULT_USER_ID, gameId: "x", entries: [] }),
      record: async () => {
        throw new Error("disk full")
      },
    }
    const coordinator = createPlayRecordingCoordinator({
      store: failing,
      onError: error => {
        seen = error
      },
    })
    coordinator.beginLaunch(context())
    const recorded = await coordinator.completeLaunch(
      "launch-1",
      new Date("2026-07-01T20:05:00.000Z"),
    )
    expect(recorded).toBe(false)
    expect((seen as Error).message).toBe("disk full")
  })
})
