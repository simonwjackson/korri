import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createFilePlayLogStore,
  createInMemoryPlayLogStore,
} from "./play-log-store"

const entry = (iso: string, durationSeconds: number) => ({
  occurredAt: new Date(iso),
  durationSeconds,
})

describe("in-memory play-log store", () => {
  it("records a qualifying entry and reads it back (AE1)", async () => {
    const store = createInMemoryPlayLogStore()
    const recorded = await store.record(
      "snes/f-zero",
      entry("2026-07-01T20:44:00.000Z", 2100),
    )
    expect(recorded).toBe(true)
    const log = await store.load("snes/f-zero")
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.durationSeconds).toBe(2100)
  })

  it("rejects a sub-threshold entry without recording it (AE2)", async () => {
    const store = createInMemoryPlayLogStore()
    const recorded = await store.record(
      "snes/f-zero",
      entry("2026-07-01T20:44:00.000Z", 30),
      { thresholdSeconds: 120 },
    )
    expect(recorded).toBe(false)
    expect((await store.load("snes/f-zero")).entries).toHaveLength(0)
  })

  it("reads an empty log for a never-played game (AE3)", async () => {
    const store = createInMemoryPlayLogStore()
    expect((await store.load("snes/unknown")).entries).toHaveLength(0)
  })
})

describe("file-backed play-log store", () => {
  it("persists entries across store instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "play-log-store-"))
    try {
      const writer = createFilePlayLogStore(root)
      await writer.record("snes/f-zero", entry("2026-07-01T20:44:00.000Z", 90))
      await writer.record("snes/f-zero", entry("2026-07-02T10:00:00.000Z", 600))

      const reader = createFilePlayLogStore(root)
      const log = await reader.load("snes/f-zero")
      expect(log.entries).toHaveLength(2)
      expect(log.entries[1]?.occurredAt.toISOString()).toBe(
        "2026-07-02T10:00:00.000Z",
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("gates sub-threshold sessions before touching disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "play-log-store-"))
    try {
      const store = createFilePlayLogStore(root)
      const recorded = await store.record(
        "snes/f-zero",
        entry("2026-07-01T20:44:00.000Z", 5),
        { thresholdSeconds: 60 },
      )
      expect(recorded).toBe(false)
      expect((await store.load("snes/f-zero")).entries).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
