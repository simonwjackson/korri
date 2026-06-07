import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import type { SourceRecord } from "./records/source"
import type { StorageRecord } from "./records/storage"
import { resolveSourceTarget } from "./source-target-resolution"

const storage = new Map<string, StorageRecord>([
  ["roms", { id: "roms", root: "/games" }],
])

const sources = new Map<string, SourceRecord>([
  ["roms", { id: "roms", kind: ["files"], storage: "roms" }],
  ["steam", { id: "steam", kind: ["service"] }],
  ["metadata", { id: "metadata", kind: ["metadata"] }],
])

describe("resolveSourceTarget", () => {
  it("passes service URI targets through as launch locators", async () => {
    const resolved = await Effect.runPromise(
      resolveSourceTarget({
        sourceId: "steam",
        target: "steam://rungameid/360740",
        sources,
        storage,
      }),
    )

    expect(resolved).toEqual({
      sourceId: "steam",
      target: "steam://rungameid/360740",
    })
  })

  it("resolves file targets relative to the source storage root", async () => {
    const resolved = await Effect.runPromise(
      resolveSourceTarget({
        sourceId: "roms",
        target: "genesis/Sonic The Hedgehog.md",
        sources,
        storage,
      }),
    )

    expect(resolved).toEqual({
      sourceId: "roms",
      target: "genesis/Sonic The Hedgehog.md",
      content: { path: "/games/genesis/Sonic The Hedgehog.md" },
    })
  })

  it("rejects absolute file targets", async () => {
    const exit = await Effect.runPromiseExit(
      resolveSourceTarget({
        sourceId: "roms",
        target: "/games/genesis/Sonic.md",
        sources,
        storage,
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("AbsoluteFileTarget")
  })

  it("rejects relative file targets that escape the storage root", async () => {
    const exit = await Effect.runPromiseExit(
      resolveSourceTarget({
        sourceId: "roms",
        target: "../outside.sfc",
        sources,
        storage,
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("FileTargetEscapesStorage")
  })

  it("rejects metadata-only sources for launch target resolution", async () => {
    const exit = await Effect.runPromiseExit(
      resolveSourceTarget({
        sourceId: "metadata",
        target: "anything",
        sources,
        storage,
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("MetadataOnlySource")
  })
})
