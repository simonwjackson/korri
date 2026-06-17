import { describe, expect, it } from "bun:test"

import { decodeGlobalConfigPayload, GLOBAL_CONFIG_KEY } from "./global"

describe("GlobalConfigPayload (singleton)", () => {
  it("decodes a minimal empty global config", () => {
    const config = decodeGlobalConfigPayload({})
    expect(config).toEqual({})
  })

  it("declares the singleton key constant ('global')", () => {
    expect(GLOBAL_CONFIG_KEY).toBe("global")
  })

  it("decodes a global launcher default", () => {
    const config = decodeGlobalConfigPayload({ launcher: "retroarch" })
    expect(config.launcher).toBe("retroarch")
  })

  it("decodes a global gamescope launch companion policy", () => {
    const config = decodeGlobalConfigPayload({
      launch: {
        with: {
          "@korri:gamescope": { enable: false, extraArgs: ["-F", "fsr"] },
        },
      },
    })
    const gamescope = config.launch?.with?.["@korri:gamescope"]
    expect(gamescope?.enable).toBe(false)
    expect(gamescope?.extraArgs).toEqual(["-F", "fsr"])
  })

  it("decodes global presets, byLauncher, env, cwd, argsAppend, patches", () => {
    const config = decodeGlobalConfigPayload({
      launcher: "retroarch",
      env: { LANG: "en_US.UTF-8" },
      cwd: "/storage",
      argsAppend: ["--verbose"],
      patches: ["/patches/global.ips"],
      presets: {
        "max-quality": {
          launch: { with: { "@korri:gamescope": { enable: true } } },
          patches: ["/patches/max-quality.bps"],
        },
      },
      byLauncher: {
        dolphin: {
          argsAppend: ["--config", "/x"],
          patches: ["/patches/dolphin.ups"],
        },
      },
    })
    expect(config.patches).toEqual(["/patches/global.ips"])
    expect(
      config.presets?.["max-quality"]?.launch?.with?.["@korri:gamescope"]
        ?.enable,
    ).toBe(true)
    expect(config.presets?.["max-quality"]?.patches).toEqual([
      "/patches/max-quality.bps",
    ])
    expect(config.byLauncher?.dolphin?.argsAppend).toEqual(["--config", "/x"])
    expect(config.byLauncher?.dolphin?.patches).toEqual([
      "/patches/dolphin.ups",
    ])
  })

  it("rejects identity-field bypass: 'system' is not allowed", () => {
    expect(() => decodeGlobalConfigPayload({ system: "snes" })).toThrow()
  })

  it("rejects an unknown top-level key (typo)", () => {
    expect(() =>
      decodeGlobalConfigPayload({ gamescpoe: { enable: true } }),
    ).toThrow()
  })

  it("does NOT carry 'inherit' (no less-specific layer to truncate to)", () => {
    expect(() => decodeGlobalConfigPayload({ inherit: false })).toThrow()
  })
})
