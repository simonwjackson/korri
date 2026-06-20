import { describe, expect, it } from "bun:test"
import { parseRunConfig } from "./args"

describe("parseRunConfig", () => {
  it("defaults engine=auto, native=detect, gamescope on, 1920x1080 output", () => {
    const cfg = parseRunConfig(["https://x/index.html"])
    expect(cfg).toMatchObject({
      locator: "https://x/index.html",
      engine: "auto",
      native: "detect",
      output: { width: 1920, height: 1080 },
      gap: { width: 20, height: 20 },
      filter: "pixel",
      gamescope: true,
      autoplay: "no-gesture",
      extraFlags: [],
      shims: [],
    })
  })

  it("parses a pinned engine and declared native resolution", () => {
    const cfg = parseRunConfig([
      "file:///app/index.html",
      "--engine",
      "construct",
      "--native",
      "832x448",
    ])
    expect(cfg.engine).toBe("construct")
    expect(cfg.native).toEqual({ width: 832, height: 448 })
  })

  it("collects repeated --flag and --shim and honors --no-gamescope", () => {
    const cfg = parseRunConfig([
      "u",
      "--flag",
      "--allow-file-access-from-files",
      "--shim",
      "yfs-direct-launch",
      "--no-gamescope",
    ])
    expect(cfg.extraFlags).toEqual(["--allow-file-access-from-files"])
    expect(cfg.shims).toEqual(["yfs-direct-launch"])
    expect(cfg.gamescope).toBe(false)
  })

  it("requires a locator", () => {
    expect(() => parseRunConfig([])).toThrow()
  })

  it("rejects a malformed resolution", () => {
    expect(() => parseRunConfig(["u", "--output", "nope"])).toThrow()
  })
})
