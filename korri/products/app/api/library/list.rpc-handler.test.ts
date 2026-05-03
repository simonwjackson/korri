import { afterEach, describe, expect, it } from "bun:test"
import { rm } from "node:fs/promises"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { DataError } from "@shared/api/rpc/errors"
import { LibraryError, LibrarySource } from "@shared/library/library-services"
import { makeFailingLibrarySourceLayer } from "@shared/library/library-source-layer-memory"
import { createRocknixSource } from "@shared/library/rocknix/rocknix-source"
import { Cause, Effect, Exit, Layer } from "effect"
import { withTempLibrary } from "../../../../../tools/testing/library/with-temp-library"

import { handleListLibrary } from "./list.rpc-handler"

const cleanups: Array<() => Promise<void>> = []
function track<T extends { cleanup: () => Promise<void> }>(lib: T): T {
  cleanups.push(lib.cleanup)
  return lib
}

afterEach(async () => {
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

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(rocknixSourceLayer(lib))),
    )
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
    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(rocknixSourceLayer(lib))),
    )
    expect(result.games).toEqual([])
  })

  it("fails with DataError(ReadFailed) when the source's list() fails", async () => {
    const exit = await Effect.runPromiseExit(
      handleListLibrary({}).pipe(
        Effect.provide(
          makeFailingLibrarySourceLayer(
            new LibraryError({ reason: "io", message: "disk on fire" }),
          ),
        ),
      ),
    )
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
    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(rocknixSourceLayer(lib))),
    )
    // RocknixSource degrades gracefully — empty list, not a DataError.
    expect(result.games).toEqual([])
  })

  it("integration: app.library.list is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.list")
  })
})

function rocknixSourceLayer(lib: {
  readonly rootDir: string
  readonly esSystemsPath: string
  readonly launchCommand: string
}) {
  const source = createRocknixSource({
    gamelistRoots: [lib.rootDir],
    esSystemsPath: lib.esSystemsPath,
    launchCommand: lib.launchCommand,
  })

  return Layer.succeed(LibrarySource)({
    list: () =>
      Effect.tryPromise({
        try: () => source.list(),
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
    launchSpecFor: id =>
      Effect.tryPromise({
        try: () => source.launchSpecFor(id),
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })
}
