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
      gamescope: { enabled: true, args: ["-F", "fsr"] },
      env: { SDL_VIDEODRIVER: "wayland" },
      cwd: "/storage/roms",
      argsAppend: ["--debug"],
    })
    expect(override.gamescope?.enabled).toBe(true)
    expect(override.env?.SDL_VIDEODRIVER).toBe("wayland")
  })

  it("decodes byLauncher contributions + inherit", () => {
    const override = decodeEphemeralOverride({
      byLauncher: { retroarch: { argsAppend: ["-v"] } },
      inherit: false,
    })
    expect(override.byLauncher?.retroarch?.argsAppend).toEqual(["-v"])
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
      decodeEphemeralOverride({ gamescpoe: { enabled: true } }),
    ).toThrow()
  })
})
