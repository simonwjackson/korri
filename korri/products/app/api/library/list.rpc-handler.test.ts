import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { DataError } from "@shared/api/rpc/errors"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Cause, Effect, Exit } from "effect"

import { handleListLibrary } from "./list.rpc-handler"

const originalLibraryRoot = process.env.KORRI_LIBRARY_ROOT
const cleanups: Array<() => Promise<void>> = []

function track<T extends { cleanup: () => Promise<void> }>(lib: T): T {
  cleanups.push(lib.cleanup)
  return lib
}

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalLibraryRoot)
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

describe("app.library.list handler (configured-real source)", () => {
  it("returns { games } sorted by lastPlayed desc", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "snes/old.smc",
            system: "fixture",
            contentPath: "/storage/fixtures/snes/old.smc.rom",
            metadata: { name: "Old" },
            userData: { lastPlayed: new Date("2024-01-01T00:00:00.000Z") },
          },
          {
            id: "snes/new.smc",
            system: "fixture",
            contentPath: "/storage/fixtures/snes/new.smc.rom",
            metadata: { name: "New" },
            userData: { lastPlayed: new Date("2026-05-01T00:00:00.000Z") },
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )
    expect(result.games.map(g => g.metadata?.name)).toEqual(["New", "Old"])
  })

  it("returns { games: [] } for an empty ProseQL library", async () => {
    const lib = track(await withTempProseqlLibrary({ games: [] }))
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )
    expect(result.games).toEqual([])
  })

  it("fails with DataError(ReadFailed) when ProseQL data is invalid", async () => {
    const lib = track(await withInvalidProseqlLibrary())
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const exit = await Effect.runPromiseExit(
      handleListLibrary({}).pipe(Effect.provide(LibrarySourceLayerLive)),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(DataError)
      if (error instanceof DataError) {
        expect(error.reason).toBe("ReadFailed")
      }
    }
  })

  it("integration: app.library.list is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.list")
  })
})

type TempProseqlLibrary = {
  readonly root: string
  readonly cleanup: () => Promise<void>
}

async function withTempProseqlLibrary(options: {
  readonly games: readonly {
    readonly id: string
    readonly system?: string
    readonly contentPath?: string
    readonly metadata?: { readonly name?: string }
    readonly userData?: { readonly lastPlayed?: Date }
  }[]
}): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-list-test-"))
  let success = false
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)
          for (const game of options.games) {
            yield* repository.upsertGame({
              system: "fixture",
              contentPath: `/storage/fixtures/${game.id}.rom`,
              ...game,
            })
          }
          yield* Effect.promise(() => db.flush())
        }),
      ),
    )
    success = true
  } finally {
    if (!success) await rm(root, { recursive: true, force: true })
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

async function withInvalidProseqlLibrary(): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-invalid-test-"))
  let success = false
  try {
    await mkdir(root, { recursive: true })
    await writeFile(
      join(root, "games.yaml"),
      ["bad:", "  id: 123", "_version: 1", ""].join("\n"),
      "utf8",
    )
    success = true
  } finally {
    if (!success) await rm(root, { recursive: true, force: true })
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
