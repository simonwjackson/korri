import { describe, expect, it } from "bun:test"

import { DEFAULT_USER_ID } from "@platform/library/config/records/user"
import { createInMemoryPlayLogStore } from "@platform/library/play-log-store"

import { createForegroundSessionHost } from "./foreground-session-host-layer"

describe("createForegroundSessionHost", () => {
  it("has no recording coordinator when no store is wired", () => {
    expect(
      createForegroundSessionHost().playRecordingCoordinator,
    ).toBeUndefined()
  })

  it("exposes a coordinator backed by the given store", async () => {
    const store = createInMemoryPlayLogStore()
    const host = createForegroundSessionHost({ playLogStore: store })
    const coordinator = host.playRecordingCoordinator
    if (!coordinator) throw new Error("expected a recording coordinator")

    coordinator.beginLaunch({
      launchId: "launch-1",
      userId: DEFAULT_USER_ID,
      gameId: "snes/f-zero",
      startedAt: new Date("2026-07-01T20:00:00.000Z"),
    })
    await coordinator.completeLaunch(
      "launch-1",
      new Date("2026-07-01T20:10:00.000Z"),
    )

    const log = await store.load({
      userId: DEFAULT_USER_ID,
      gameId: "snes/f-zero",
    })
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.durationSeconds).toBe(600)
  })
})
