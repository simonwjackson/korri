import { describe, expect, it } from "bun:test"

import { decodeGamePayload, decodeGameRecord } from "./game"

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

  it("decodes an artifact-backed game with a content artifact reference", () => {
    const game = decodeGamePayload({
      system: "snes",
      content: {
        artifactId:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    })

    expect(game.contentPath).toBeUndefined()
    expect(game.content?.artifactId).toBe(
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
  })

  it("rejects a game without either contentPath or content.artifactId", () => {
    expect(() => decodeGamePayload({ system: "snes" })).toThrow()
  })

  it("rejects a hydrated game record without either contentPath or content.artifactId", () => {
    expect(() => decodeGameRecord({ id: "f-zero", system: "snes" })).toThrow()
  })

  it("rejects a game with both contentPath and content.artifactId", () => {
    expect(() =>
      decodeGamePayload({
        system: "snes",
        contentPath: "/storage/roms/x.smc",
        content: {
          artifactId:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
    ).toThrow()
  })

  it("rejects a hydrated game record with both contentPath and content.artifactId", () => {
    expect(() =>
      decodeGameRecord({
        id: "f-zero",
        system: "snes",
        contentPath: "/storage/roms/x.smc",
        content: {
          artifactId:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
    ).toThrow()
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

  it("decodes inheritable layer fields (launch.with Gamescope, env, cwd, argsAppend, patches)", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      launch: { with: { "@korri:gamescope": { enable: true } } },
      env: { SDL_VIDEODRIVER: "x11" },
      cwd: "/storage/roms",
      argsAppend: ["--fullscreen"],
      patches: ["/patches/base.ips", "/patches/qol.bps"],
    })
    expect(game.launch?.with?.["@korri:gamescope"]?.enable).toBe(true)
    expect(game.env?.SDL_VIDEODRIVER).toBe("x11")
    expect(game.patches).toEqual(["/patches/base.ips", "/patches/qol.bps"])
  })

  it("decodes nested presets + byLauncher", () => {
    const game = decodeGamePayload({
      system: "snes",
      contentPath: "/x.smc",
      presets: {
        "max-quality": {
          launch: {
            with: {
              "@korri:gamescope": { enable: true, extraArgs: ["-F", "fsr"] },
            },
          },
        },
      },
      byLauncher: {
        retroarch: {
          argsAppend: ["-L", "snes9x_libretro.so"],
          patches: ["/patches/retroarch-only.ips"],
        },
      },
    })
    expect(
      game.presets?.["max-quality"]?.launch?.with?.["@korri:gamescope"]?.enable,
    ).toBe(true)
    expect(game.byLauncher?.retroarch?.argsAppend).toEqual([
      "-L",
      "snes9x_libretro.so",
    ])
    expect(game.byLauncher?.retroarch?.patches).toEqual([
      "/patches/retroarch-only.ips",
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
        gamescpoe: { enable: true },
      }),
    ).toThrow()
  })
})
