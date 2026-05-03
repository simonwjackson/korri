import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { withTempLibrary } from "../../../tools/testing/library/with-temp-library"
import {
  clearLibraryContextCacheForTesting,
  configureLibraryContextForTesting,
  getLibraryContext,
  resetLibraryContextForTesting,
} from "./library-context"
import { createRocknixSource } from "./rocknix/rocknix-source"
import { createShellLauncher } from "./shell-launcher"

const cleanups: Array<() => Promise<void>> = []
function track<T extends { cleanup: () => Promise<void> }>(lib: T): T {
  cleanups.push(lib.cleanup)
  return lib
}

const ENV_KEYS = [
  "KORRI_LIBRARY_SOURCE",
  "KORRI_LAUNCHER",
  "KORRI_ROCKNIX_GAMELIST_ROOTS",
  "KORRI_ROCKNIX_ES_SYSTEMS",
] as const

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
  resetLibraryContextForTesting()
  clearLibraryContextCacheForTesting()
})

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
  resetLibraryContextForTesting()
  clearLibraryContextCacheForTesting()
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

describe("library-context", () => {
  it("default env produces a real RocknixSource + ShellLauncher (without hitting /storage)", () => {
    delete process.env.KORRI_LIBRARY_SOURCE
    delete process.env.KORRI_LAUNCHER
    delete process.env.KORRI_ROCKNIX_GAMELIST_ROOTS
    delete process.env.KORRI_ROCKNIX_ES_SYSTEMS
    const ctx = getLibraryContext()
    // Structural assertions only — we never call `list()` against the
    // real /storage paths in unit tests.
    expect(typeof ctx.source.list).toBe("function")
    expect(typeof ctx.source.launchSpecFor).toBe("function")
    expect(typeof ctx.launcher.run).toBe("function")
  })

  it("returns the same instance across calls (singleton)", () => {
    const a = getLibraryContext()
    const b = getLibraryContext()
    expect(a).toBe(b)
  })

  it("configureLibraryContextForTesting wins over env-driven construction", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [
              { path: "echo.smc", name: "Echo", lastPlayed: "20260101T000000" },
            ],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    const launcher = createShellLauncher()
    configureLibraryContextForTesting({ source, launcher })

    const ctx = getLibraryContext()
    expect(ctx.source).toBe(source)
    expect(ctx.launcher).toBe(launcher)

    const games = await ctx.source.list()
    expect(games.map(g => g.metadata?.name)).toEqual(["Echo"])
  })

  it("configured launcher actually runs (real Bun.spawn) against fake-game.sh", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "echo.smc", name: "Echo" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    configureLibraryContextForTesting({
      source,
      launcher: createShellLauncher(),
    })

    const ctx = getLibraryContext()
    const games = await ctx.source.list()
    const spec = await ctx.source.launchSpecFor(games[0]!.id)
    expect(spec).toBeDefined()
    const result = await ctx.launcher.run(spec!)
    expect(result.status).toBe("launched")
  })

  it("unknown KORRI_LIBRARY_SOURCE falls back to rocknix without throwing", () => {
    process.env.KORRI_LIBRARY_SOURCE = "totally-unknown"
    const ctx = getLibraryContext()
    expect(typeof ctx.source.list).toBe("function")
  })

  it("unknown KORRI_LAUNCHER falls back to shell without throwing", () => {
    process.env.KORRI_LAUNCHER = "totally-unknown"
    const ctx = getLibraryContext()
    expect(typeof ctx.launcher.run).toBe("function")
  })

  it("KORRI_ROCKNIX_GAMELIST_ROOTS is colon-separated", async () => {
    const a = track(
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
    const b = track(
      await withTempLibrary({
        systems: [
          {
            name: "wii",
            defaultEmulator: "dolphin-sa",
            defaultCore: "dolphin-sa",
            extension: [".wbfs"],
            games: [{ path: "b.wbfs", name: "B" }],
          },
        ],
      }),
    )
    // Use a's es_systems.cfg for everything; only the gamelist roots vary.
    process.env.KORRI_ROCKNIX_GAMELIST_ROOTS = `${a.rootDir}:${b.rootDir}`
    process.env.KORRI_ROCKNIX_ES_SYSTEMS = a.esSystemsPath
    const ctx = getLibraryContext()
    const games = await ctx.source.list()
    // Only games for systems present in `a`'s es_systems.cfg (snes) survive;
    // wii is dropped because that es_systems.cfg only knows about snes.
    expect(games.map(g => g.metadata?.name)).toEqual(["A"])
  })

  it("resetLibraryContextForTesting() restores env-driven construction", () => {
    const fakeSource = {
      list: async () => [],
      launchSpecFor: async () => undefined,
    }
    const fakeLauncher = { run: async () => ({ status: "launched" as const }) }
    configureLibraryContextForTesting({
      source: fakeSource,
      launcher: fakeLauncher,
    })
    expect(getLibraryContext().source).toBe(fakeSource)

    resetLibraryContextForTesting()
    expect(getLibraryContext().source).not.toBe(fakeSource)
  })
})
