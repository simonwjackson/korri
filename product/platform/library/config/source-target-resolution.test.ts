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

  it("resolves executable targets after traversal validation", async () => {
    const resolved = await Effect.runPromise(
      resolveReleaseTarget({
        target: { kind: "executable", path: "ports/run.sh" },
        storage,
      }),
    )

    expect(resolved).toEqual({ target: "ports/run.sh" })

    const exit = await Effect.runPromiseExit(
      resolveReleaseTarget({
        target: { kind: "executable", path: "../run.sh" },
        storage,
      }),
    )
    expect(exit._tag).toBe("Failure")
    expect(String(exit)).toContain("FileTargetEscapesStorage")

    const absolute = await Effect.runPromiseExit(
      resolveReleaseTarget({
        target: { kind: "executable", path: "/run/current-system/sw/bin/game" },
        storage,
      }),
    )
    expect(absolute._tag).toBe("Failure")
    expect(String(absolute)).toContain("AbsoluteFileTarget")
  })

  it("resolves provider-ref targets as provider-qualified locators", async () => {
    const resolved = await Effect.runPromise(
      resolveReleaseTarget({
        target: { kind: "provider-ref", provider: "@korri:steam", ref: "1029210" },
        storage,
      }),
    )

    expect(resolved).toEqual({ target: "@korri:steam:1029210" })
  })

  it("selects file-set parts by explicit launch input", async () => {
    const target = {
      kind: "file-set" as const,
      storage: "roms",
      root: "pc98/game",
      files: [
        { id: "readme", role: "manual", path: "README.txt" },
        { id: "disk-a", role: "boot", path: "disk-a.hdi" },
      ],
    }

    const byPart = await Effect.runPromise(
      resolveReleaseTarget({ target, storage, input: { part: "disk-a" } }),
    )
    expect(byPart.content?.path).toBe("/games/pc98/game/disk-a.hdi")

    const byRole = await Effect.runPromise(
      resolveReleaseTarget({ target, storage, input: { roles: ["boot"] } }),
    )
    expect(byRole.content?.path).toBe("/games/pc98/game/disk-a.hdi")

    const missing = await Effect.runPromiseExit(
      resolveReleaseTarget({ target, storage, input: { part: "missing" } }),
    )
    expect(missing._tag).toBe("Failure")
    expect(String(missing)).toContain("FileSetPartNotFound")
  })
})
