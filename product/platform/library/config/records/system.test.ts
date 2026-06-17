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

  it("rejects legacy launch and launcher fields", () => {
    expect(() => decodeSystemPayload({ launcher: "retroarch" })).toThrow(
      /apps\[\]|system\.launcher/i,
    )
    expect(() => decodeSystemPayload({ launch: { app: "retroarch" } })).toThrow(
      /Unexpected key|launch/i,
    )
  })

  it("decodes system app choices", () => {
    const system = decodeSystemPayload({
      apps: [
        { id: "retroarch", runtime: "mgba" },
        { id: "ryubing", inherit: false, argsAppend: ["--fullscreen"] },
      ],
    })

    expect(system.apps).toEqual([
      { id: "retroarch", runtime: "mgba" },
      { id: "ryubing", inherit: false, argsAppend: ["--fullscreen"] },
    ])
  })

  it("rejects empty and duplicate system app choices", () => {
    expect(() => decodeSystemPayload({ apps: [] })).toThrow(
      /apps.*empty|at least one app choice/i,
    )
    expect(() =>
      decodeSystemPayload({ apps: [{ id: "retroarch" }, { id: "retroarch" }] }),
    ).toThrow(/unique/)
  })

  it("decodes inheritable layer + presets + byLauncher + inherit", () => {
    const system = decodeSystemPayload({
      cores: { retroarch: "snes9x_libretro.so" },
      launch: { with: { "@korri:gamescope": { enable: false } } },
      env: { LANG: "C" },
      argsAppend: ["--snes"],
      patches: ["/patches/system.ips"],
      presets: {
        perf: {
          launch: { with: { "@korri:gamescope": { enable: true } } },
          patches: ["/patches/perf.bps"],
        },
      },
      byLauncher: {
        dolphin: {
          argsAppend: ["--snes-mode"],
          patches: ["/patches/dolphin.ups"],
        },
      },
      inherit: false,
    })
    expect(system.launch?.with?.["@korri:gamescope"]?.enable).toBe(false)
    expect(system.patches).toEqual(["/patches/system.ips"])
    expect(
      system.presets?.perf?.launch?.with?.["@korri:gamescope"]?.enable,
    ).toBe(true)
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
