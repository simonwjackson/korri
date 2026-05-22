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

  it("decodes a global gamescope policy", () => {
    const config = decodeGlobalConfigPayload({
      gamescope: { enabled: false, args: ["-F", "fsr"] },
    })
    expect(config.gamescope?.enabled).toBe(false)
    expect(config.gamescope?.args).toEqual(["-F", "fsr"])
  })

  it("decodes global presets, byLauncher, env, cwd, argsAppend", () => {
    const config = decodeGlobalConfigPayload({
      launcher: "retroarch",
      env: { LANG: "en_US.UTF-8" },
      cwd: "/storage",
      argsAppend: ["--verbose"],
      presets: { "max-quality": { gamescope: { enabled: true } } },
      byLauncher: { dolphin: { argsAppend: ["--config", "/x"] } },
    })
    expect(config.presets?.["max-quality"]?.gamescope?.enabled).toBe(true)
    expect(config.byLauncher?.dolphin?.argsAppend).toEqual(["--config", "/x"])
  })

  it("rejects identity-field bypass: 'system' is not allowed", () => {
    expect(() => decodeGlobalConfigPayload({ system: "snes" })).toThrow()
  })

  it("rejects an unknown top-level key (typo)", () => {
    expect(() =>
      decodeGlobalConfigPayload({ gamescpoe: { enabled: true } }),
    ).toThrow()
  })

  it("does NOT carry 'inherit' (no less-specific layer to truncate to)", () => {
    expect(() => decodeGlobalConfigPayload({ inherit: false })).toThrow()
  })
})
