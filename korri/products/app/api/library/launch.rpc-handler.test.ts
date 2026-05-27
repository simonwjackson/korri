import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { EntrySource } from "@shared/api/rpc/entry-source"
import { NotFoundError } from "@shared/api/rpc/errors"
import { makeInMemoryLauncherLayer } from "@shared/library/launcher-layer-memory"
import {
  Launcher,
  LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { createShellLauncher } from "@shared/library/shell-launcher"
import type { ForegroundSessionState } from "@shared/stream/foreground-session-lifecycle"
import { Cause, Effect, Exit, Layer } from "effect"

import {
  createForegroundSessionHost,
  ForegroundSessionHost,
} from "./foreground-session-host-layer"
import { handleLaunchLibrary } from "./launch.rpc-handler"

const originalLibraryRoot = process.env.KORRI_LIBRARY_ROOT
const cleanups: Array<() => Promise<void>> = []

// Shared `source` payload field for tests. The launch handler does not
// route on this in U1 (local path only) but the schema requires it.
const localTestSource = new EntrySource({
  hostId: "launch-test-host",
  controlUrl: "http://127.0.0.1:3001",
  isLocal: true,
})
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
  layer: Layer.Layer<LibrarySource | Launcher | ForegroundSessionHost>
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
    spawn: spec =>
      Effect.tryPromise({
        try: () => {
          const spawn = realLauncher.spawn
          if (!spawn) throw new Error("shell launcher missing managed spawn")
          return spawn({
            ...spec,
            env: {
              ...(spec.env ?? {}),
              KORRI_FAKE_GAME_EXIT: String(exitCode),
            },
          })
        },
        catch: error =>
          new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
  })

  return {
    layer: Layer.mergeAll(
      LibrarySourceLayerLive,
      launcherLayer,
      Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
    ),
  }
}

describe("app.library.launch handler (configured-real launcher + fake-game.sh)", () => {
  it("returns { status: 'launched' } for a known ProseQL-backed id with KORRI_FAKE_GAME_EXIT=0", async () => {
    const { layer } = await layerForFakeGame(0)
    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "snes/echo.smc" }).pipe(Effect.provide(layer)),
    )
    expect(result).toEqual({ status: "launched" })
  })

  it("accepts (and ignores in U1) a `source` payload field for the local launch path", async () => {
    const { layer } = await layerForFakeGame(0)
    // U1 makes `source` payload-acceptable; U5 turns it into a routing
    // discriminator. For now the handler treats the local-tagged payload
    // identically to the bare-id call: success.
    const result = await Effect.runPromise(
      handleLaunchLibrary({
        id: "snes/echo.smc",
        source: localTestSource,
      }).pipe(Effect.provide(layer)),
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

  it("wraps the resolved launch with Gamescope before invoking the launcher", async () => {
    let launchedSpec: unknown
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: () =>
        Effect.succeed({
          spec: { command: "/bin/game", args: ["rom"] },
          gamescope: { enabled: true },
        }),
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: spec => {
        launchedSpec = spec
        return Effect.succeed({ status: "launched" as const })
      },
      spawn: spec => {
        launchedSpec = spec
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
          ),
        ),
      ),
    )

    expect(result).toEqual({ status: "launched" })
    expect(launchedSpec).toEqual({
      command: "gamescope",
      args: ["-f", "-b", "--", "/bin/game", "rom"],
    })
  })

  it("passes selected preset inputs and honors a direct-launch opt-out", async () => {
    let resolveInputs: unknown
    let launchedSpec: unknown
    const sourceLayer = Layer.succeed(LibrarySource)({
      list: () =>
        Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
      launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
      resolveLaunchForGame: (_id, inputs) => {
        resolveInputs = inputs
        return Effect.succeed({
          spec: { command: "/bin/game", args: ["rom"] },
          gamescope: { enabled: false },
        })
      },
    })
    const launcherLayer = Layer.succeed(Launcher)({
      run: spec => {
        launchedSpec = spec
        return Effect.succeed({ status: "launched" as const })
      },
      spawn: spec => {
        launchedSpec = spec
        return Effect.succeed({
          status: "started" as const,
          result: Promise.resolve({ status: "launched" as const }),
          session: completedSessionHandle(),
        })
      },
    })

    const result = await Effect.runPromise(
      handleLaunchLibrary({ id: "game", presetId: "raw" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            sourceLayer,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
          ),
        ),
      ),
    )

    expect(result).toEqual({ status: "launched" })
    expect(resolveInputs).toEqual({
      userId: undefined,
      presetId: "raw",
      override: undefined,
    })
    expect(launchedSpec).toEqual({ command: "/bin/game", args: ["rom"] })
  })

  it("keeps app.library.launch pending while the managed local child is running", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const host = createForegroundSessionHost()
    const layer = Layer.mergeAll(
      localGameSourceLayer({ gamescope: { enabled: false } }),
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
      Layer.succeed(ForegroundSessionHost)(host),
    )

    const launch = Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )
    await waitForOwnerState(host, "Running")
    let settled = false
    void launch.then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)

    control.resolveExit({ exitCode: 0 })
    expect(await launch).toEqual({ status: "launched" })
    await host.owner.whenIdle()
  })

  it("rejects local launch re-entry as session-busy without spawning a second child", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const host = createForegroundSessionHost()
    const layer = Layer.mergeAll(
      localGameSourceLayer({ gamescope: { enabled: false } }),
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
      Layer.succeed(ForegroundSessionHost)(host),
    )

    const first = Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )
    await waitForOwnerState(host, "Running")

    const second = await Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )

    expect(second).toMatchObject({
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    control.resolveExit({ exitCode: 0 })
    await first
    await host.owner.whenIdle()
  })

  it("preserves terminal failure diagnostics after the managed local child exits", async () => {
    const control = makeInMemoryLauncherLayer.createManagedControl()
    const host = createForegroundSessionHost()
    const layer = Layer.mergeAll(
      localGameSourceLayer({ gamescope: { enabled: false } }),
      makeInMemoryLauncherLayer({ behavior: { kind: "managed", control } }),
      Layer.succeed(ForegroundSessionHost)(host),
    )

    const launch = Effect.runPromise(
      handleLaunchLibrary({ id: "game" }).pipe(Effect.provide(layer)),
    )
    await waitForOwnerState(host, "Running")

    control.resolveExit({ exitCode: 7, stderrTail: "boom" })

    expect(await launch).toEqual({
      status: "failed",
      exitCode: 7,
      stderrTail: "boom",
    })
    await host.owner.whenIdle()
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
        Effect.provide(
          Layer.mergeAll(
            LibrarySourceLayerLive,
            launcherLayer,
            Layer.succeed(ForegroundSessionHost)(createForegroundSessionHost()),
          ),
        ),
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

function completedSessionHandle() {
  return {
    id: "completed-local-child",
    processId: 123,
    exited: Promise.resolve({ exitCode: 0 }),
    terminate: () => {},
    terminateNow: () => {},
  }
}

function localGameSourceLayer(options: {
  readonly gamescope: { readonly enabled: boolean }
}) {
  return Layer.succeed(LibrarySource)({
    list: () =>
      Effect.succeed([{ id: "game", system: "s", contentPath: "rom" }]),
    launchSpecFor: () => Effect.fail(new LibraryError({ reason: "config" })),
    resolveLaunchForGame: () =>
      Effect.succeed({
        spec: { command: "/bin/game", args: ["rom"] },
        gamescope: options.gamescope,
      }),
  })
}

async function waitForOwnerState(
  host: ReturnType<typeof createForegroundSessionHost>,
  state: ForegroundSessionState["_tag"],
) {
  for (let index = 0; index < 20; index += 1) {
    if (host.owner.status().state._tag === state) return
    await Promise.resolve()
  }
  expect(host.owner.status().state._tag).toBe(state)
}

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
          yield* repository.upsertGlobalConfig({
            gamescope: { enabled: false },
          })
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
