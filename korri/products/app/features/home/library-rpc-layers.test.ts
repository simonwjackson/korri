import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { EntrySource } from "@shared/api/rpc/entry-source"
import { Launcher, LibrarySource } from "@shared/library/library-services"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Effect } from "effect"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"
import { LauncherLayerRpc } from "./launcher-layer-rpc"
import { LibrarySourceLayerRpc } from "./library-source-layer-rpc"

const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  launchExitEnvValue: process.env.KORRI_FAKE_GAME_EXIT,
}
const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}
const REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const FAKE_GAME = join(REPO_ROOT, "tools", "testing", "fake-game.sh")

afterEach(() => {
  restoreEnv()
  setWindowLocation(originalLocation)
})

describe("RPC-backed library layers", () => {
  it("lists games through the production RPC client and server", async () => {
    await using server = await withRpcServer()
    await using lib = await seedLibrary()
    pointWindowAt(server.url)
    configureLibraryEnv(lib)

    const games = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* LibrarySource
        return yield* source.list()
      }).pipe(Effect.provide(LibrarySourceLayerRpc)),
    )

    expect(games.map(game => game.metadata?.name)).toEqual(["RPC Echo"])
  })

  it("launches games through the production RPC client and server", async () => {
    await using server = await withRpcServer()
    await using lib = await seedLibrary()
    pointWindowAt(server.url)
    configureLibraryEnv(lib)
    process.env.KORRI_FAKE_GAME_EXIT = "7"

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const launcher = yield* Launcher
        return yield* launcher.run({ command: "snes/echo.smc", args: [] })
      }).pipe(Effect.provide(LauncherLayerRpc)),
    )

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toContain("-Psnes")
    }
  })

  it("forwards source through to the server when LauncherLayerRpc.run sees a remote-source LaunchOptions", async () => {
    await using server = await withRpcServer()
    await using lib = await seedLibrary()
    pointWindowAt(server.url)
    configureLibraryEnv(lib)

    // The server's app.library.launch handler rejects empty controlUrl
    // before any peer call, returning host-unavailable. That's the cheapest
    // observable proof that LauncherLayerRpc threaded `source` through.
    const remoteSource = new EntrySource({
      hostId: "aka",
      controlUrl: "",
      isLocal: false,
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const launcher = yield* Launcher
        return yield* launcher.run(
          { command: "snes/echo.smc", args: [] },
          { source: remoteSource },
        )
      }).pipe(Effect.provide(LauncherLayerRpc)),
    )

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.failureKind).toBe("host-unavailable")
      expect(result.stderrTail).toContain("controlUrl")
    }
  })

  it("preserves typed launch failure kinds through the production RPC launcher", async () => {
    await using server = await withRpcServer()
    await using lib = await seedLibrary({ longRunning: true })
    pointWindowAt(server.url)
    configureLibraryEnv(lib)

    const launch = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const launcher = yield* Launcher
          return yield* launcher.run({ command: "snes/echo.smc", args: [] })
        }).pipe(Effect.provide(LauncherLayerRpc)),
      )

    const first = launch()
    await delay(50)

    const second = await launch()

    expect(second).toMatchObject({
      status: "failed",
      exitCode: 121,
      failureKind: "session-busy",
    })
    expect(await first).toEqual({ status: "launched" })
  })
})

type TempProseqlLibrary = {
  readonly root: string
  readonly cleanup: () => Promise<void>
  readonly [Symbol.asyncDispose]: () => Promise<void>
}

async function seedLibrary(
  options: { readonly longRunning?: boolean } = {},
): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-rpc-test-"))
  let success = false
  try {
    const command = options.longRunning
      ? await writeLongRunningGameScript(root)
      : FAKE_GAME
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)
          yield* repository.upsertGlobalConfig({
            gamescope: { enabled: false },
          })
          yield* repository.upsertImportedGame({
            game: {
              id: "snes/echo.smc",
              system: "snes",
              contentPath: "/tmp/roms/snes/echo.smc",
              metadata: { name: "RPC Echo" },
              userData: { lastPlayed: new Date("2026-05-01T00:00:00.000Z") },
            },
            launcher: {
              id: "rocknix-retroarch",
              command,
              args: [
                "{contentPath}",
                "-P{system}",
                "--core={core}",
                "--emulator=retroarch",
              ],
              systems: ["snes"],
            },
            systemDelta: {
              id: "snes",
              cores: { "rocknix-retroarch": "snes9x" },
            },
          })
          yield* Effect.promise(() => db.flush())
        }),
      ),
    )
    success = true
  } finally {
    if (!success) await rm(root, { recursive: true, force: true })
  }

  const cleanup = async () => {
    await rm(root, { recursive: true, force: true })
  }

  return {
    root,
    cleanup,
    [Symbol.asyncDispose]: cleanup,
  }
}

function pointWindowAt(baseUrl: string): void {
  const url = new URL(baseUrl)
  setWindowLocation({
    origin: url.origin,
    href: `${url.origin}/`,
    hostname: url.hostname,
    pathname: "/",
  })
}

function setWindowLocation(location: {
  readonly origin: string
  readonly href: string
  readonly hostname: string
  readonly pathname: string
}): void {
  Object.defineProperty(window.location, "origin", {
    value: location.origin,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "href", {
    value: location.href,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "hostname", {
    value: location.hostname,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "pathname", {
    value: location.pathname,
    writable: true,
    configurable: true,
  })
}

function configureLibraryEnv(lib: TempProseqlLibrary): void {
  process.env.KORRI_LIBRARY_ROOT = lib.root
}

function restoreEnv(): void {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_FAKE_GAME_EXIT", originalEnv.launchExitEnvValue)
}

async function writeLongRunningGameScript(root: string): Promise<string> {
  const script = join(root, "long-running-game.sh")
  await writeFile(
    script,
    `#!/usr/bin/env bash\necho "long-running game launched" 1>&2\nsleep 0.2\nexit 0\n`,
  )
  await chmod(script, 0o755)
  return script
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
