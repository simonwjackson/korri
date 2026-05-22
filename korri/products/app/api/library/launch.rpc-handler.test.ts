import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { NotFoundError } from "@shared/api/rpc/errors"
import {
  Launcher,
  LibraryError,
  type LibrarySource,
} from "@shared/library/library-services"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { createShellLauncher } from "@shared/library/shell-launcher"
import { Cause, Effect, Exit, Layer } from "effect"

import { handleLaunchLibrary } from "./launch.rpc-handler"

const originalLibraryRoot = process.env.KORRI_LIBRARY_ROOT
const cleanups: Array<() => Promise<void>> = []
const REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const FAKE_GAME = join(REPO_ROOT, "tools", "testing", "fake-game.sh")

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalLibraryRoot)
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

async function layerForFakeGame(exitCode: number): Promise<{
  layer: Layer.Layer<LibrarySource | Launcher>
}> {
  const lib = await withTempProseqlLibrary()
  cleanups.push(lib.cleanup)
  process.env.KORRI_LIBRARY_ROOT = lib.root

  const realLauncher = createShellLauncher()
  const launcherLayer = Layer.succeed(Launcher)({
    run: spec =>
      Effect.tryPromise({
        try: () =>
          realLauncher.run({
            ...spec,
            env: {
              ...(spec.env ?? {}),
              KORRI_FAKE_GAME_EXIT: String(exitCode),
            },
          }),
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })

  return { layer: Layer.merge(LibrarySourceLayerLive, launcherLayer) }
}

describe("app.library.launch handler (configured-real launcher + fake-game.sh)", () => {
  it("returns { status: 'launched' } for a known ProseQL-backed id with KORRI_FAKE_GAME_EXIT=0", async () => {
    const { layer } = await layerForFakeGame(0)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual({ status: "launched" })
  })

  it("returns { status: 'failed', exitCode } and includes argv echoed by fake-game.sh in stderrTail", async () => {
    const { layer } = await layerForFakeGame(7)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toContain("-Psnes")
      expect(result.stderrTail).toContain("--core=snes9x")
      expect(result.stderrTail).toContain("--emulator=retroarch")
    }
  })

  it("returns failed launch diagnostics for a misconfigured profile (no spawn)", async () => {
    const lib = await withTempProseqlLibrary({ missingProfile: true })
    cleanups.push(lib.cleanup)
    process.env.KORRI_LIBRARY_ROOT = lib.root
    const launcherLayer = Layer.succeed(Launcher)({
      run: () =>
        Effect.fail(
          new LibraryError({
            reason: "io",
            message: "launcher should not run for configuration failures",
          }),
        ),
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(
        Effect.provide(Layer.merge(LibrarySourceLayerLive, launcherLayer)),
      ),
    )

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(124)
      expect(result.stderrTail).toContain("missing launcher profile")
    }
  })

  it("fails with NotFoundError for unknown id (no spawn)", async () => {
    const { layer } = await layerForFakeGame(0)
    const exit = await Effect.runPromiseExit(
      handleLaunchLibrary({ id: "snes/does-not-exist.smc" }).pipe(
        Effect.provide(layer),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(NotFoundError)
    }
  })

  it("integration: the launch RPC's tag is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.launch")
  })
})

type TempProseqlLibrary = {
  readonly root: string
  readonly cleanup: () => Promise<void>
}

async function withTempProseqlLibrary(
  options: { readonly missingProfile?: boolean } = {},
): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-launch-test-"))
  let success = false
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)
          yield* repository.upsertGame({
            id: "snes/echo.smc",
            system: "snes",
            contentPath: "/tmp/roms/snes/echo.smc",
            metadata: { name: "Echo" },
            userData: { lastPlayed: new Date("2026-05-01T00:00:00.000Z") },
          })
          yield* repository.upsertSystem({
            id: "snes",
            launcher: "rocknix-retroarch",
            cores: { "rocknix-retroarch": "snes9x" },
          })
          if (!options.missingProfile) {
            yield* repository.upsertLauncher({
              id: "rocknix-retroarch",
              command: FAKE_GAME,
              args: [
                "{contentPath}",
                "-P{system}",
                "--core={core}",
                "--emulator=retroarch",
              ],
              systems: ["snes"],
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

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
