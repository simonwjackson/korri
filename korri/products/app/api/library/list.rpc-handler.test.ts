import { afterEach, describe, expect, it } from "bun:test"
import { rm } from "node:fs/promises"
import { Cause, Effect, Exit } from "effect"

import { withTempLibrary } from "../../../../../tools/testing/library/with-temp-library"
import { appRpcGroup } from "@shared/api/rpc/app-rpc-group"
import { DataError } from "@shared/api/rpc/errors"
import {
  configureLibraryContextForTesting,
  resetLibraryContextForTesting,
} from "@shared/library/library-context"
import { createRocknixSource } from "@shared/library/rocknix/rocknix-source"
import { createShellLauncher } from "@shared/library/shell-launcher"

import { handleListLibrary } from "./list.rpc-handler"

const cleanups: Array<() => Promise<void>> = []
function track<T extends { cleanup: () => Promise<void> }>(lib: T): T {
  cleanups.push(lib.cleanup)
  return lib
}

afterEach(async () => {
  resetLibraryContextForTesting()
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

describe("app.library.list handler (configured-real source)", () => {
  it("returns { games } sorted by lastPlayed desc", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [
              { path: "old.smc", name: "Old", lastPlayed: "20240101T000000" },
              { path: "new.smc", name: "New", lastPlayed: "20260501T000000" },
            ],
          },
        ],
      }),
    )
    configureLibraryContextForTesting({
      source: createRocknixSource({
        gamelistRoots: [lib.rootDir],
        esSystemsPath: lib.esSystemsPath,
        launchCommand: lib.launchCommand,
      }),
      launcher: createShellLauncher(),
    })

    const result = await Effect.runPromise(handleListLibrary({}))
    expect(result.games.map(g => g.metadata?.name)).toEqual(["New", "Old"])
  })

  it("returns { games: [] } for an empty library (es_systems.cfg present, no game entries)", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [],
          },
        ],
      }),
    )
    configureLibraryContextForTesting({
      source: createRocknixSource({
        gamelistRoots: [lib.rootDir],
        esSystemsPath: lib.esSystemsPath,
        launchCommand: lib.launchCommand,
      }),
      launcher: createShellLauncher(),
    })
    const result = await Effect.runPromise(handleListLibrary({}))
    expect(result.games).toEqual([])
  })

  it("fails with DataError(ReadFailed) when the source's list() throws", async () => {
    // Build a source that will throw — not a Stub, just a real object whose
    // list() rejects. This exercises the handler's error mapping path.
    const failing = {
      list: async (): Promise<never> => {
        throw new Error("disk on fire")
      },
      launchSpecFor: async () => undefined,
    }
    configureLibraryContextForTesting({
      source: failing,
      launcher: createShellLauncher(),
    })

    const exit = await Effect.runPromiseExit(handleListLibrary({}))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(DataError)
      if (error instanceof DataError) {
        expect(error.reason).toBe("ReadFailed")
        expect(error.message).toContain("disk on fire")
      }
    }
  })

  it("integration: also reflects unlinking es_systems.cfg between configure and call", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "a.smc", name: "A" }],
          },
        ],
      }),
    )
    await rm(lib.esSystemsPath, { force: true })
    configureLibraryContextForTesting({
      source: createRocknixSource({
        gamelistRoots: [lib.rootDir],
        esSystemsPath: lib.esSystemsPath,
        launchCommand: lib.launchCommand,
      }),
      launcher: createShellLauncher(),
    })
    const result = await Effect.runPromise(handleListLibrary({}))
    // RocknixSource degrades gracefully — empty list, not a DataError.
    expect(result.games).toEqual([])
  })

  it("integration: app.library.list is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.list")
  })
})
