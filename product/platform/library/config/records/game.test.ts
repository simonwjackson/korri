import { describe, expect, it } from "bun:test"

import { decodeGamePayload } from "./game"

describe("GamePayload", () => {
  it("decodes a minimal game (only the identity fields)", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/storage/roms/snes/f-zero.smc",
    })
    expect(game.system).toBe("snes")
    expect(game.contentPath).toBe("/storage/roms/snes/f-zero.smc")
  })

  it("rejects a game without 'system' (identity is required)", () => {
    expect(() =>
      decodeGamePayload({ contentPath: "/storage/roms/x.smc" }),
    ).toThrow()
  })

  it("rejects a game without 'contentPath' (identity is required)", () => {
    expect(() => decodeGamePayload({ system: "snes" })).toThrow()
  })

  it("decodes optional fixture metadata + userData", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      metadata: { name: "F-Zero", developer: "Nintendo" },
      userData: { favorite: true, playtime: 3600 },
    })
    expect(game.metadata?.name).toBe("F-Zero")
    expect(game.userData?.favorite).toBe(true)
  })

  it("decodes optional launcher + core + collections", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      launcher: "snes9x",
      core: "snes9x_libretro.so",
      collections: ["classics-1990s", "racing"],
    })
    expect(game.launcher).toBe("snes9x")
    expect(game.core).toBe("snes9x_libretro.so")
    expect(game.collections).toEqual(["classics-1990s", "racing"])
  })

  it("decodes inheritable layer fields (gamescope, env, cwd, argsAppend)", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      gamescope: { enabled: true },
      env: { SDL_VIDEODRIVER: "x11" },
      cwd: "/storage/roms",
      argsAppend: ["--fullscreen"],
    })
    expect(game.gamescope?.enabled).toBe(true)
    expect(game.env?.SDL_VIDEODRIVER).toBe("x11")
  })

  it("decodes nested presets + byLauncher", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      presets: {
        "max-quality": {
          gamescope: { enabled: true, args: ["-F", "fsr"] },
        },
      },
      byLauncher: {
        retroarch: { argsAppend: ["-L", "snes9x_libretro.so"] },
      },
    })
    expect(game.presets?.["max-quality"]?.gamescope?.enabled).toBe(true)
    expect(game.byLauncher?.retroarch?.argsAppend).toEqual([
      "-L",
      "snes9x_libretro.so",
    ])
  })

  it("decodes inherit:false escape hatch", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      inherit: false,
    })
    expect(game.inherit).toBe(false)
  })

  it("rejects an unknown top-level key (typo)", () => {
    expect(() =>
      decodeGamePayload({
        system: "snes",
        contentPath: "/x.smc",
        gamescpoe: { enabled: true },
      }),
    ).toThrow()
  })
})
