import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { PlayHistoryKey } from "./config/records/play-log"
import {
  createFilePlayLogStore,
  createInMemoryPlayLogStore,
  playLogStoreRoot,
} from "./play-log-store"

const key = (userId: string, gameId: string): PlayHistoryKey => ({
  userId,
  gameId,
})
const alice = key("alice", "snes/f-zero")
const bob = key("bob", "snes/f-zero")

const entry = (iso: string, durationSeconds: number, releaseId?: string) => ({
  occurredAt: new Date(iso),
  durationSeconds,
  ...(releaseId ? { releaseId } : {}),
})

describe("in-memory play-log store", () => {
  it("records a qualifying entry and reads it back for that (user, game)", async () => {
    const store = createInMemoryPlayLogStore()
    const recorded = await store.record(
      alice,
      entry("2026-07-01T20:44:00.000Z", 2100),
    )
    expect(recorded).toBe(true)
    const log = await store.load(alice)
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.durationSeconds).toBe(2100)
    expect(log.userId).toBe("alice")
  })

  it("keeps history independent per user for the same game", async () => {
    const store = createInMemoryPlayLogStore()
    await store.record(alice, entry("2026-07-01T20:44:00.000Z", 2100))
    expect((await store.load(alice)).entries).toHaveLength(1)
    expect((await store.load(bob)).entries).toHaveLength(0)
  })

  it("round-trips a release tag as provenance", async () => {
    const store = createInMemoryPlayLogStore()
    await store.record(alice, entry("2026-07-01T20:44:00.000Z", 60, "steam"))
    expect((await store.load(alice)).entries[0]?.releaseId).toBe("steam")
  })

  it("rejects a sub-threshold entry without recording it", async () => {
    const store = createInMemoryPlayLogStore()
    const recorded = await store.record(
      alice,
      entry("2026-07-01T20:44:00.000Z", 30),
      { thresholdSeconds: 120 },
    )
    expect(recorded).toBe(false)
    expect((await store.load(alice)).entries).toHaveLength(0)
  })

  it("reads an empty log for a never-played (user, game)", async () => {
    const store = createInMemoryPlayLogStore()
    expect(
      (await store.load(key("alice", "snes/unknown"))).entries,
    ).toHaveLength(0)
  })
})

describe("playLogStoreRoot", () => {
  it("prefers KORRI_PLAY_LOG_DIR, then XDG_STATE_HOME, then HOME", () => {
    expect(playLogStoreRoot({ KORRI_PLAY_LOG_DIR: "/explicit" })).toBe(
      "/explicit",
    )
    expect(playLogStoreRoot({ XDG_STATE_HOME: "/state" })).toBe(
      "/state/korri/play-log",
    )
    expect(playLogStoreRoot({ HOME: "/home/pat" })).toBe(
      "/home/pat/.local/state/korri/play-log",
    )
  })
})

describe("file-backed play-log store", () => {
  it("persists entries per (user, game) across store instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "play-log-store-"))
    try {
      const writer = createFilePlayLogStore(root)
      await writer.record(alice, entry("2026-07-01T20:44:00.000Z", 90))
      await writer.record(
        alice,
        entry("2026-07-02T10:00:00.000Z", 600, "steam"),
      )

      const reader = createFilePlayLogStore(root)
      const log = await reader.load(alice)
      expect(log.entries).toHaveLength(2)
      expect(log.entries[1]?.occurredAt.toISOString()).toBe(
        "2026-07-02T10:00:00.000Z",
      )
      expect(log.entries[1]?.releaseId).toBe("steam")
      // A different user's history for the same game is untouched.
      expect((await reader.load(bob)).entries).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("gates sub-threshold sessions before touching disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "play-log-store-"))
    try {
      const store = createFilePlayLogStore(root)
      const recorded = await store.record(
        alice,
        entry("2026-07-01T20:44:00.000Z", 5),
        { thresholdSeconds: 60 },
      )
      expect(recorded).toBe(false)
      expect((await store.load(alice)).entries).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
