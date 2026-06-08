import { describe, expect, it } from "bun:test"

import { decodePresetPayload } from "./preset"

describe("PresetPayload", () => {
  it("decodes a minimal preset (every field optional)", () => {
    const preset = decodePresetPayload({})
    expect(preset).toEqual({})
  })

  it("decodes a preset that sets a launcher", () => {
    const preset = decodePresetPayload({
      name: "Max Quality",
      description: "Crank everything.",
      launcher: "snes9x",
    })
    expect(preset.launcher).toBe("snes9x")
  })

  it("decodes inheritable behavior fields (gamescope, env, cwd, argsAppend, patches)", () => {
    const preset = decodePresetPayload({
      gamescope: { enable: true, extraArgs: ["-F", "fsr"] },
      env: { SDL_VIDEODRIVER: "x11" },
      cwd: "/storage/roms",
      argsAppend: ["--fullscreen"],
      patches: ["/patches/color.ips"],
    })
    expect(preset.gamescope?.enable).toBe(true)
    expect(preset.env?.SDL_VIDEODRIVER).toBe("x11")
    expect(preset.cwd).toBe("/storage/roms")
    expect(preset.argsAppend).toEqual(["--fullscreen"])
    expect(preset.patches).toEqual(["/patches/color.ips"])
  })

  it("decodes byLauncher contributions (preset can target a specific launcher)", () => {
    const preset = decodePresetPayload({
      byLauncher: {
        retroarch: {
          argsAppend: ["-L", "snes9x_libretro.so"],
          patches: ["/patches/retroarch-only.ips"],
        },
      },
    })
    expect(preset.byLauncher?.retroarch?.argsAppend).toEqual([
      "-L",
      "snes9x_libretro.so",
    ])
    expect(preset.byLauncher?.retroarch?.patches).toEqual([
      "/patches/retroarch-only.ips",
    ])
  })

  it("decodes inherit:false (escape hatch truncates the chain)", () => {
    const preset = decodePresetPayload({ inherit: false })
    expect(preset.inherit).toBe(false)
  })

  it("rejects identity-field bypass: 'system' is loud-fail", () => {
    expect(() => decodePresetPayload({ system: "snes" })).toThrow()
  })

  it("rejects identity-field bypass: 'contentPath' is loud-fail", () => {
    expect(() =>
      decodePresetPayload({ contentPath: "/storage/roms/foo.smc" }),
    ).toThrow()
  })

  it("rejects nested presets-in-presets", () => {
    expect(() =>
      decodePresetPayload({ presets: { nested: { launcher: "x" } } }),
    ).toThrow()
  })

  it("rejects an unknown top-level key (typo)", () => {
    expect(() => decodePresetPayload({ gamescpoe: { enable: true } })).toThrow()
  })
})
