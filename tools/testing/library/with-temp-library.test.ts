import { describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

import { withTempLibrary } from "./with-temp-library"

describe("tools/testing/library/with-temp-library", () => {
  it("writes the documented on-disk layout for a single-system fixture", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          fullname: "Super Nintendo",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          extension: [".smc", ".sfc"],
          games: [
            {
              path: "old.smc",
              name: "Old",
              lastPlayed: "20240101T000000",
            },
            {
              path: "new.smc",
              name: "New",
              lastPlayed: "20260101T000000",
              favorite: true,
              playcount: 7,
            },
          ],
        },
      ],
    })

    try {
      // rootDir contains a `snes` system folder.
      const systemDir = join(lib.rootDir, "snes")
      expect(existsSync(systemDir)).toBe(true)

      // ROM placeholders written.
      expect(existsSync(join(systemDir, "old.smc"))).toBe(true)
      expect(existsSync(join(systemDir, "new.smc"))).toBe(true)

      // gamelist.xml written.
      const gamelist = await readFile(join(systemDir, "gamelist.xml"), "utf8")
      expect(gamelist).toContain("<gameList>")
      expect(gamelist).toContain("<path>./old.smc</path>")
      expect(gamelist).toContain("<path>./new.smc</path>")
      expect(gamelist).toContain("<name>Old</name>")
      expect(gamelist).toContain("<name>New</name>")
      expect(gamelist).toContain("<lastplayed>20240101T000000</lastplayed>")
      expect(gamelist).toContain("<lastplayed>20260101T000000</lastplayed>")
      expect(gamelist).toContain("<favorite>true</favorite>")
      expect(gamelist).toContain("<playcount>7</playcount>")

      // es_systems.cfg written at the documented path.
      expect(lib.esSystemsPath).toBe(join(lib.rootDir, "..", "es_systems.cfg"))
      const cfg = await readFile(lib.esSystemsPath, "utf8")
      expect(cfg).toContain("<systemList>")
      expect(cfg).toContain("<name>snes</name>")
      expect(cfg).toContain("<fullname>Super Nintendo</fullname>")
      expect(cfg).toContain("<extension>.smc .sfc</extension>")
      expect(cfg).toContain(`<path>${systemDir}</path>`)
      // Real ROCKNIX format: defaults live in the nested <emulators>
      // block, not in the <command> template. The <command> keeps the
      // %CORE% / %EMULATOR% placeholders intact.
      expect(cfg).toContain("--core=%CORE%")
      expect(cfg).toContain("--emulator=%EMULATOR%")
      expect(cfg).toContain('<emulator name="retroarch">')
      expect(cfg).toContain('<core default="true">snes9x</core>')
      // Default launchCommand is the repo's fake-game.sh, embedded in <command>.
      expect(cfg).toContain("tools/testing/fake-game.sh")
      expect(lib.launchCommand).toMatch(/tools\/testing\/fake-game\.sh$/)
    } finally {
      await lib.cleanup()
    }
  })

  it("supports multiple systems and isolates them under separate folders", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "a.smc", name: "A" }],
        },
        {
          name: "nes",
          defaultEmulator: "retroarch",
          defaultCore: "nestopia",
          games: [{ path: "b.nes", name: "B" }],
        },
      ],
    })

    try {
      expect(existsSync(join(lib.rootDir, "snes", "a.smc"))).toBe(true)
      expect(existsSync(join(lib.rootDir, "nes", "b.nes"))).toBe(true)
      expect(existsSync(join(lib.rootDir, "snes", "b.nes"))).toBe(false)

      const cfg = await readFile(lib.esSystemsPath, "utf8")
      expect(cfg).toContain("<name>snes</name>")
      expect(cfg).toContain("<name>nes</name>")
      expect(cfg).toContain('<core default="true">snes9x</core>')
      expect(cfg).toContain('<core default="true">nestopia</core>')
    } finally {
      await lib.cleanup()
    }
  })

  it("uses an explicit launchCommand override when provided", async () => {
    const lib = await withTempLibrary({
      launchCommand: "/usr/bin/runemu.sh",
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "x.smc" }],
        },
      ],
    })

    try {
      expect(lib.launchCommand).toBe("/usr/bin/runemu.sh")
      const cfg = await readFile(lib.esSystemsPath, "utf8")
      expect(cfg).toContain("/usr/bin/runemu.sh %ROM% -P%SYSTEM%")
      expect(cfg).not.toContain("fake-game.sh")
    } finally {
      await lib.cleanup()
    }
  })

  it("emits valid XML even when fixture fields contain reserved characters", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [
            {
              path: "weird.smc",
              name: "Castle & <Quest>",
              desc: "Has \"quotes\" and 'apostrophes' & angle brackets <like this>.",
            },
          ],
        },
      ],
    })

    try {
      const gamelist = await readFile(
        join(lib.rootDir, "snes", "gamelist.xml"),
        "utf8",
      )
      // Reserved characters escaped, never bare.
      expect(gamelist).toContain("Castle &amp; &lt;Quest&gt;")
      expect(gamelist).toContain("&quot;quotes&quot;")
      expect(gamelist).toContain("&apos;apostrophes&apos;")
      expect(gamelist).not.toContain("<Quest>")
      expect(gamelist).not.toContain('"quotes"')
    } finally {
      await lib.cleanup()
    }
  })

  it("omits optional gamelist fields rather than emitting empty elements", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "minimal.smc" }],
        },
      ],
    })

    try {
      const gamelist = await readFile(
        join(lib.rootDir, "snes", "gamelist.xml"),
        "utf8",
      )
      expect(gamelist).toContain("<path>./minimal.smc</path>")
      expect(gamelist).not.toContain("<name>")
      expect(gamelist).not.toContain("<lastplayed>")
      expect(gamelist).not.toContain("<favorite>")
      expect(gamelist).not.toContain("<desc>")
    } finally {
      await lib.cleanup()
    }
  })

  it("handles an empty system (no games) without crashing", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [],
        },
      ],
    })

    try {
      const gamelist = await readFile(
        join(lib.rootDir, "snes", "gamelist.xml"),
        "utf8",
      )
      expect(gamelist).toContain("<gameList>")
      expect(gamelist).toContain("</gameList>")
      expect(gamelist).not.toContain("<game>")
    } finally {
      await lib.cleanup()
    }
  })

  it("cleanup() removes every file and directory it created", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "a.smc" }],
        },
      ],
    })

    expect(existsSync(lib.rootDir)).toBe(true)
    expect(existsSync(lib.esSystemsPath)).toBe(true)

    await lib.cleanup()

    expect(existsSync(lib.rootDir)).toBe(false)
    expect(existsSync(lib.esSystemsPath)).toBe(false)
  })

  it("cleanup() is idempotent (calling twice does not throw)", async () => {
    const lib = await withTempLibrary({
      systems: [
        {
          name: "snes",
          defaultEmulator: "retroarch",
          defaultCore: "snes9x",
          games: [{ path: "a.smc" }],
        },
      ],
    })

    await lib.cleanup()
    await expect(lib.cleanup()).resolves.toBeUndefined()
  })

  it("supports `await using` resource management via Symbol.asyncDispose", async () => {
    let observedRoot: string
    {
      await using lib = await withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            games: [{ path: "a.smc" }],
          },
        ],
      })
      observedRoot = lib.rootDir
      const info = await stat(observedRoot)
      expect(info.isDirectory()).toBe(true)
    }

    expect(existsSync(observedRoot)).toBe(false)
  })

  it("isolates concurrent calls (no tmpdir collision)", async () => {
    const [a, b] = await Promise.all([
      withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            games: [{ path: "a.smc" }],
          },
        ],
      }),
      withTempLibrary({
        systems: [
          {
            name: "snes",
            defaultEmulator: "retroarch",
            defaultCore: "snes9x",
            games: [{ path: "b.smc" }],
          },
        ],
      }),
    ])

    try {
      expect(a.rootDir).not.toBe(b.rootDir)
      expect(existsSync(join(a.rootDir, "snes", "a.smc"))).toBe(true)
      expect(existsSync(join(b.rootDir, "snes", "b.smc"))).toBe(true)
      expect(existsSync(join(a.rootDir, "snes", "b.smc"))).toBe(false)
    } finally {
      await a.cleanup()
      await b.cleanup()
    }
  })
})
