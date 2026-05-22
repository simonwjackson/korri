import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { NotFoundError, ValidationError } from "@shared/api/rpc/errors"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Cause, Effect, Exit } from "effect"

import { decodeLaunchIntent } from "../../../../../tools/device/game-stream-launch-intent"
import { handlePrepareStream } from "./prepare.rpc-handler"

const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
}
const cleanups: Array<() => Promise<void>> = []
const REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const FAKE_GAME = join(REPO_ROOT, "tools", "testing", "fake-game.sh")

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_GAME_STREAM_INTENT_PATH", originalEnv.intentPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.stream.prepare handler", () => {
  it("fails closed when stream control is not enabled", async () => {
    await setupPreparedEnv({ enabled: false })

    const exit = await Effect.runPromiseExit(
      handlePrepareStream({ id: "snes/echo.smc" }).pipe(
        Effect.provide(LibrarySourceLayerLive),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ValidationError)
    }
  })

  it("writes a one-shot launch intent for a known game when enabled", async () => {
    const { intentPath } = await setupPreparedEnv({ enabled: true })

    const result = await Effect.runPromise(
      handlePrepareStream({ id: "snes/echo.smc" }).pipe(
        Effect.provide(LibrarySourceLayerLive),
      ),
    )

    expect(result.status).toBe("prepared")
    expect(result.gameId).toBe("snes/echo.smc")
    expect(result.intentPath).toBe(intentPath)

    const intent = decodeLaunchIntent(
      JSON.parse(await readFile(intentPath, "utf8")),
    )
    expect(intent.lifecycle).toBe("foreground")
    expect(intent.launch.command).toBe(FAKE_GAME)
    expect(intent.launch.args).toContain("/storage/roms/snes/echo.smc")
    expect(intent.gamescope).toEqual({ enabled: true, args: ["-f"] })
  })

  it("fails for unknown ids without writing an intent", async () => {
    const { intentPath } = await setupPreparedEnv({ enabled: true })

    const exit = await Effect.runPromiseExit(
      handlePrepareStream({ id: "missing" }).pipe(
        Effect.provide(LibrarySourceLayerLive),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(NotFoundError)
    }
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("integration: app.stream.prepare is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.stream.prepare")
  })
})

async function setupPreparedEnv(options: { readonly enabled: boolean }) {
  const library = await withTempProseqlLibrary()
  cleanups.push(library.cleanup)
  const intentDir = await mkdtemp(join(tmpdir(), "korri-stream-prepare-"))
  await chmod(intentDir, 0o700)
  cleanups.push(() => rm(intentDir, { recursive: true, force: true }))

  process.env.KORRI_LIBRARY_ROOT = library.root
  process.env.KORRI_GAME_STREAM_INTENT_PATH = join(
    intentDir,
    "next-launch.json",
  )
  process.env.KORRI_STREAM_CONTROL_ENABLED = options.enabled ? "1" : "0"
  delete process.env.XDG_RUNTIME_DIR

  return { intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH }
}

async function withTempProseqlLibrary(): Promise<{
  readonly root: string
  readonly cleanup: () => Promise<void>
}> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-stream-prepare-"))
  let success = false
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)
          yield* repository.upsertSystem({
            id: "snes",
            launcher: "rocknix-retroarch",
            gamescope: { enabled: true, args: ["-f"] },
          })
          yield* repository.upsertLauncher({
            id: "rocknix-retroarch",
            command: FAKE_GAME,
            args: ["{contentPath}"],
            systems: ["snes"],
          })
          yield* repository.upsertGame({
            id: "snes/echo.smc",
            system: "snes",
            contentPath: "/storage/roms/snes/echo.smc",
            metadata: { name: "Echo" },
          })
          yield* Effect.promise(() => db.flush())
        }),
      ),
    )
    success = true
  } finally {
    if (!success) await rm(root, { recursive: true, force: true })
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
