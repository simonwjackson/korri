import { describe, expect, it } from "bun:test"

import { decodeEphemeralOverride } from "./ephemeral-override"

describe("EphemeralOverride", () => {
  it("decodes an empty override (zero opinions)", () => {
    const override = decodeEphemeralOverride({})
    expect(override).toEqual({})
  })

  it("decodes a launcher switch", () => {
    const override = decodeEphemeralOverride({ launcher: "snes9x" })
    expect(override.launcher).toBe("snes9x")
  })

  it("decodes inheritable behavior contributions", () => {
    const override = decodeEphemeralOverride({
      gamescope: { enable: true, extraArgs: ["-F", "fsr"] },
      env: { SDL_VIDEODRIVER: "wayland" },
      cwd: "/storage/roms",
      argsAppend: ["--debug"],
      patches: ["/patches/override.ips"],
    })
    expect(override.gamescope?.enable).toBe(true)
    expect(override.env?.SDL_VIDEODRIVER).toBe("wayland")
    expect(override.patches).toEqual(["/patches/override.ips"])
  })

  it("decodes byLauncher contributions + inherit", () => {
    const override = decodeEphemeralOverride({
      byLauncher: {
        retroarch: { argsAppend: ["-v"], patches: ["/patches/retroarch.ips"] },
      },
      inherit: false,
    })
    expect(override.byLauncher?.retroarch?.argsAppend).toEqual(["-v"])
    expect(override.byLauncher?.retroarch?.patches).toEqual([
      "/patches/retroarch.ips",
    ])
    expect(override.inherit).toBe(false)
  })

  it("rejects identity-field bypass: 'system' is not allowed", () => {
    expect(() => decodeEphemeralOverride({ system: "snes" })).toThrow()
  })

  it("rejects identity-field bypass: 'contentPath' is not allowed", () => {
    expect(() =>
      decodeEphemeralOverride({ contentPath: "/storage/roms/x.smc" }),
    ).toThrow()
  })

  it("rejects 'name' / 'description' (those belong to presets, not overrides)", () => {
    expect(() => decodeEphemeralOverride({ name: "My Override" })).toThrow()
  })

  it("rejects 'presets' (overrides don't carry nested presets)", () => {
    expect(() => decodeEphemeralOverride({ presets: { x: {} } })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() =>
      decodeEphemeralOverride({ gamescpoe: { enable: true } }),
    ).toThrow()
  })
})
