import { describe, expect, it } from "bun:test"

import { decodeSystemPayload } from "./system"

describe("SystemPayload", () => {
  it("decodes a minimal system (every field optional)", () => {
    const system = decodeSystemPayload({})
    expect(system).toEqual({})
  })

  it("decodes a system carrying a 'cores' map (per-launcher defaults)", () => {
    const system = decodeSystemPayload({
      cores: {
        retroarch: "snes9x_libretro.so",
        snes9x: "snes9x_native",
      },
    })
    expect(system.cores?.retroarch).toBe("snes9x_libretro.so")
    expect(system.cores?.snes9x).toBe("snes9x_native")
  })

  it("decodes optional 'launcher' default for this system", () => {
    const system = decodeSystemPayload({ launcher: "retroarch" })
    expect(system.launcher).toBe("retroarch")
  })

  it("decodes inheritable layer + presets + byLauncher + inherit", () => {
    const system = decodeSystemPayload({
      launcher: "retroarch",
      cores: { retroarch: "snes9x_libretro.so" },
      gamescope: { enabled: false },
      env: { LANG: "C" },
      argsAppend: ["--snes"],
      patches: ["/patches/system.ips"],
      presets: {
        perf: { gamescope: { enabled: true }, patches: ["/patches/perf.bps"] },
      },
      byLauncher: {
        dolphin: {
          argsAppend: ["--snes-mode"],
          patches: ["/patches/dolphin.ups"],
        },
      },
      inherit: false,
    })
    expect(system.gamescope?.enabled).toBe(false)
    expect(system.patches).toEqual(["/patches/system.ips"])
    expect(system.presets?.perf?.gamescope?.enabled).toBe(true)
    expect(system.presets?.perf?.patches).toEqual(["/patches/perf.bps"])
    expect(system.byLauncher?.dolphin?.argsAppend).toEqual(["--snes-mode"])
    expect(system.byLauncher?.dolphin?.patches).toEqual([
      "/patches/dolphin.ups",
    ])
  })

  it("rejects identity-field bypass: 'contentPath' is not allowed", () => {
    expect(() => decodeSystemPayload({ contentPath: "/x.smc" })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() => decodeSystemPayload({ launchr: "retroarch" })).toThrow()
  })
})
