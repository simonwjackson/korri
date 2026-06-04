import { describe, expect, it } from "bun:test"

import {
  decodeByLauncherPayload,
  decodeGamescopePolicy,
  decodeInheritableLayer,
  normalizeGamescopePolicy,
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

  it("decodes a backend selection", () => {
    expect(decodeGamescopePolicy({ backend: "wayland" })).toEqual({
      backend: "wayland",
    })
    expect(decodeGamescopePolicy({ backend: "sdl" })).toEqual({
      backend: "sdl",
    })
  })

  it("rejects an unknown backend", () => {
    expect(() => decodeGamescopePolicy({ backend: "vulkan-direct" })).toThrow()
  })

  it("decodes exposeWayland opt-in", () => {
    expect(decodeGamescopePolicy({ exposeWayland: true })).toEqual({
      exposeWayland: true,
    })
  })

  it("normalizes a missing policy to the kiosk-shaped default", () => {
    // The product default assumes gamescope is wrapping a nested
    // launch under a parent Wayland compositor (sway, in production).
    // YAML can override per game / per launcher when running standalone.
    expect(normalizeGamescopePolicy(undefined)).toEqual({
      enabled: true,
      backend: "wayland",
      exposeWayland: true,
    })
  })

  it("preserves explicit policy fields over the default", () => {
    expect(
      normalizeGamescopePolicy({
        enabled: false,
        backend: "drm",
        exposeWayland: false,
        args: ["-F", "fsr"],
      }),
    ).toEqual({
      enabled: false,
      backend: "drm",
      exposeWayland: false,
      args: ["-F", "fsr"],
    })
  })
})

describe("InheritableLayer", () => {
  it("decodes an empty layer (zero opinions)", () => {
    const layer = decodeInheritableLayer({})
    expect(layer).toEqual({})
  })

  it("decodes a layer carrying every supported inheritable field", () => {
    const layer = decodeInheritableLayer({
      gamescope: {
        enabled: true,
        command: "/run/current-system/sw/bin/gamescope",
        args: ["-F", "fsr"],
      },
      env: { LANG: "en_US.UTF-8", SDL_VIDEODRIVER: "x11" },
      cwd: "/storage/roms",
      argsAppend: ["--fullscreen", "--verbose"],
      patches: ["/storage/patches/base.ips", "/storage/patches/qol.bps"],
    })
    expect(layer.gamescope?.enabled).toBe(true)
    expect(layer.gamescope?.command).toBe(
      "/run/current-system/sw/bin/gamescope",
    )
    expect(layer.env?.LANG).toBe("en_US.UTF-8")
    expect(layer.cwd).toBe("/storage/roms")
    expect(layer.argsAppend).toEqual(["--fullscreen", "--verbose"])
    expect(layer.patches).toEqual([
      "/storage/patches/base.ips",
      "/storage/patches/qol.bps",
    ])
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
      retroarch: {
        argsAppend: ["-L", "snes9x_libretro.so"],
        patches: ["/storage/patches/restoration.ips"],
      },
      dolphin: { env: { DOLPHIN_PROFILE: "default" } },
    })
    expect(payload.retroarch?.argsAppend).toEqual(["-L", "snes9x_libretro.so"])
    expect(payload.retroarch?.patches).toEqual([
      "/storage/patches/restoration.ips",
    ])
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
