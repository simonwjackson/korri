import { afterEach, describe, expect, it } from "bun:test"
import { Launcher, LibrarySource } from "@shared/library/library-services"
import { Effect } from "effect"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"
import {
  type TempLibrary,
  withTempLibrary,
} from "../../../../../tools/testing/library/with-temp-library"
import { LauncherLayerRpc } from "./launcher-layer-rpc"
import { LibrarySourceLayerRpc } from "./library-source-layer-rpc"

const originalEnv = {
  roots: process.env.KORRI_ROCKNIX_GAMELIST_ROOTS,
  esSystems: process.env.KORRI_ROCKNIX_ES_SYSTEMS,
  launchExitEnvValue: process.env.KORRI_FAKE_GAME_EXIT,
}
const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}

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
})

async function seedLibrary(): Promise<TempLibrary> {
  return withTempLibrary({
    systems: [
      {
        name: "snes",
        defaultEmulator: "retroarch",
        defaultCore: "snes9x",
        extension: [".smc"],
        games: [{ path: "echo.smc", name: "RPC Echo" }],
      },
    ],
  })
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

function configureLibraryEnv(lib: TempLibrary): void {
  process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = lib.rootDir
  process.env.KORRI_ROCKNIX_ES_SYSTEMS = lib.esSystemsPath
}

function restoreEnv(): void {
  setOptionalEnv("KORRI_ROCKNIX_GAMELIST_ROOTS", originalEnv.roots)
  setOptionalEnv("KORRI_ROCKNIX_ES_SYSTEMS", originalEnv.esSystems)
  setOptionalEnv("KORRI_FAKE_GAME_EXIT", originalEnv.launchExitEnvValue)
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
