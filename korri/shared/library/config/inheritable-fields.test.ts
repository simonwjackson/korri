import { describe, expect, it } from "bun:test"

import {
  decodeByLauncherPayload,
  decodeGamescopePolicy,
  decodeInheritableLayer,
} from "./inheritable-fields"

describe("GamescopePolicy", () => {
  it("decodes an empty object as 'no opinion'", () => {
    const policy = decodeGamescopePolicy({})
    expect(policy).toEqual({})
  })

  it("decodes enabled with a list of args", () => {
    const policy = decodeGamescopePolicy({
      enabled: true,
      args: ["-F", "fsr", "-W", "1920"],
    })
    expect(policy.enabled).toBe(true)
    expect(policy.args).toEqual(["-F", "fsr", "-W", "1920"])
  })

  it("decodes enabled=false explicitly", () => {
    const policy = decodeGamescopePolicy({ enabled: false })
    expect(policy.enabled).toBe(false)
  })

  it("rejects an unknown key", () => {
    expect(() =>
      decodeGamescopePolicy({ enabled: true, gamescpoe: "typo" }),
    ).toThrow()
  })
})

describe("InheritableLayer", () => {
  it("decodes an empty layer (zero opinions)", () => {
    const layer = decodeInheritableLayer({})
    expect(layer).toEqual({})
  })

  it("decodes a layer carrying every supported inheritable field", () => {
    const layer = decodeInheritableLayer({
      gamescope: { enabled: true, args: ["-F", "fsr"] },
      env: { LANG: "en_US.UTF-8", SDL_VIDEODRIVER: "x11" },
      cwd: "/storage/roms",
      argsAppend: ["--fullscreen", "--verbose"],
    })
    expect(layer.gamescope?.enabled).toBe(true)
    expect(layer.env?.LANG).toBe("en_US.UTF-8")
    expect(layer.cwd).toBe("/storage/roms")
    expect(layer.argsAppend).toEqual(["--fullscreen", "--verbose"])
  })

  it("rejects an unknown inheritable field (typo)", () => {
    expect(() =>
      decodeInheritableLayer({ gamescpoe: { enabled: true } }),
    ).toThrow()
  })

  it("rejects a gamescope sub-object with an unknown key", () => {
    expect(() =>
      decodeInheritableLayer({
        gamescope: { enabled: true, weirdKey: "bad" },
      }),
    ).toThrow()
  })
})

describe("byLauncher payload", () => {
  it("decodes an empty map", () => {
    const payload = decodeByLauncherPayload({})
    expect(payload).toEqual({})
  })

  it("decodes per-launcher inheritable contributions", () => {
    const payload = decodeByLauncherPayload({
      retroarch: { argsAppend: ["-L", "snes9x_libretro.so"] },
      dolphin: { env: { DOLPHIN_PROFILE: "default" } },
    })
    expect(payload.retroarch?.argsAppend).toEqual(["-L", "snes9x_libretro.so"])
    expect(payload.dolphin?.env?.DOLPHIN_PROFILE).toBe("default")
  })

  it("rejects an unknown inheritable field inside a launcher entry", () => {
    expect(() =>
      decodeByLauncherPayload({
        retroarch: { argsAppend: ["-L", "x"], wat: true },
      }),
    ).toThrow()
  })
})
