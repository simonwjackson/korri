import { afterEach, describe, expect, it } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"

import { withTempLibrary } from "../../../../tools/testing/library/with-temp-library"

import { createRocknixSource } from "./rocknix-source"

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

describe("createRocknixSource (real filesystem via withTempLibrary)", () => {
  it("list() returns games sorted by lastPlayed desc with undefined last", async () => {
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
              { path: "never.smc", name: "Never" },
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
    const games = await source.list()
    expect(games.map(g => g.metadata?.name)).toEqual(["New", "Old", "Never"])
  })

  it("composes ids as <system>/<rom-basename>", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "zelda.smc", name: "Zelda" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    const games = await source.list()
    expect(games[0]?.id).toBe("snes/zelda.smc")
  })

  it("launchSpecFor returns a fully-resolved spec with ROCKNIX argv (controllers omitted)", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "zelda.smc", name: "Zelda" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    await source.list()
    const spec = await source.launchSpecFor("snes/zelda.smc")
    expect(spec).toBeDefined()
    expect(spec?.command).toBe(lib.launchCommand)
    expect(spec?.args).toEqual([
      join(lib.rootDir, "snes", "zelda.smc"),
      "-Psnes",
      "--core=snes9x",
      "--emulator=retroarch",
    ])
    // --controllers="..." token must not appear in argv.
    for (const arg of spec?.args ?? []) {
      expect(arg.startsWith("--controllers=")).toBe(false)
    }
  })

  it("launchSpecFor returns undefined for unknown id", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "a.smc" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    await source.list()
    const spec = await source.launchSpecFor("snes/missing.smc")
    expect(spec).toBeUndefined()
  })

  it("returns [] when gamelist root does not exist (does not throw)", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "a.smc" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [join(lib.rootDir, "..", "does-not-exist")],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    const games = await source.list()
    expect(games).toEqual([])
  })

  it("returns [] when es_systems.cfg is missing", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "a.smc" }],
          },
        ],
      }),
    )
    // Delete es_systems.cfg.
    await rm(lib.esSystemsPath, { force: true })
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    const games = await source.list()
    expect(games).toEqual([])
  })

  it("drops games whose system is absent from es_systems.cfg", async () => {
    // Write a library with one system, then remove that system from
    // es_systems.cfg by overwriting it with an empty <systemList/>.
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
    await Bun.write(
      lib.esSystemsPath,
      `<?xml version="1.0"?><systemList></systemList>`,
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    const games = await source.list()
    expect(games).toEqual([])
  })

  it("integration: every listed game has a defined launch spec", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [
              { path: "a.smc", name: "A" },
              { path: "b.smc", name: "B" },
            ],
          },
          {
            name: "wii",
            defaultEmulator: "dolphin-sa",
            defaultCore: "dolphin-sa",
            extension: [".wbfs"],
            games: [{ path: "c.wbfs", name: "C" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    const games = await source.list()
    expect(games).toHaveLength(3)
    for (const game of games) {
      const spec = await source.launchSpecFor(game.id)
      expect(spec).toBeDefined()
    }
  })

  it("preserves spaces in rom paths within argv (no shell quoting needed)", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [{ path: "Super Mario World.smc", name: "SMW" }],
          },
        ],
      }),
    )
    const source = createRocknixSource({
      gamelistRoots: [lib.rootDir],
      esSystemsPath: lib.esSystemsPath,
      launchCommand: lib.launchCommand,
    })
    await source.list()
    const spec = await source.launchSpecFor("snes/Super Mario World.smc")
    expect(spec?.args[0]).toBe(
      join(lib.rootDir, "snes", "Super Mario World.smc"),
    )
  })

  it("withTempLibrary round-trip: helper-produced files are read back as the same library", async () => {
    const lib = track(
      await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            extension: [".smc"],
            games: [
              {
                path: "echo.smc",
                name: "Echo",
                lastPlayed: "20260101T120000",
                playcount: 3,
                favorite: true,
              },
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
    const games = await source.list()
    expect(games).toHaveLength(1)
    const echo = games[0]
    expect(echo?.metadata?.name).toBe("Echo")
    expect(echo?.userData?.favorite).toBe(true)
    expect(echo?.userData?.lastPlayed).toBeInstanceOf(Date)
    expect(echo?.userData?.lastPlayed?.toISOString()).toBe(
      "2026-01-01T12:00:00.000Z",
    )
  })
})
