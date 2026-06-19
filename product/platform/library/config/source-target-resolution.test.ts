import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import type { StorageRecord } from "./records/storage"
import { resolveReleaseTarget } from "./source-target-resolution"

const storage = new Map<string, StorageRecord>([
  ["roms", { id: "roms", root: "/games" }],
])

describe("resolveReleaseTarget", () => {
  it("passes URL targets through as launch locators", async () => {
    const resolved = await Effect.runPromise(
      resolveReleaseTarget({
        target: { kind: "url", value: "steam://rungameid/360740" },
        storage,
      }),
    )

    expect(resolved).toEqual({
      target: "steam://rungameid/360740",
    })
  })

  it("resolves file targets relative to the storage root", async () => {
    const resolved = await Effect.runPromise(
      resolveReleaseTarget({
        target: {
          kind: "file",
          storage: "roms",
          path: "genesis/Sonic The Hedgehog.md",
        },
        storage,
      }),
    )

    expect(resolved).toEqual({
      target: "genesis/Sonic The Hedgehog.md",
      content: { path: "/games/genesis/Sonic The Hedgehog.md" },
    })
  })

  it("rejects absolute file targets", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReleaseTarget({
        target: {
          kind: "file",
          storage: "roms",
          path: "/games/genesis/Sonic.md",
        },
        storage,
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("AbsoluteFileTarget")
  })

  it("rejects relative file targets that escape the storage root", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReleaseTarget({
        target: { kind: "file", storage: "roms", path: "../outside.sfc" },
        storage,
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("FileTargetEscapesStorage")
  })

  it("rejects missing storage ids", async () => {
    const exit = await Effect.runPromiseExit(
      resolveReleaseTarget({
        target: { kind: "file", storage: "missing", path: "anything" },
        storage,
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("StorageNotFound")
  })
})
