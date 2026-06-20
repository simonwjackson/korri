import { describe, expect, it } from "bun:test"
import { webLaunchArgs } from "./launch-args"

describe("webLaunchArgs", () => {
  it("emits no extra args by default (generic auto launch)", () => {
    expect(webLaunchArgs({})).toEqual([])
  })

  it("pins engine and declared native resolution", () => {
    expect(
      webLaunchArgs({
        engine: "gamemaker",
        nativeResolution: { width: 1008, height: 720 },
      }),
    ).toEqual(["--engine", "gamemaker", "--native", "1008x720"])
  })

  it("passes extra chromium flags and shim files", () => {
    expect(
      webLaunchArgs({
        engine: "construct",
        nativeResolution: { width: 832, height: 448 },
        extraFlags: ["--allow-file-access-from-files"],
        shims: ["/nix/store/x/yfs-direct-launch.js"],
      }),
    ).toEqual([
      "--engine",
      "construct",
      "--native",
      "832x448",
      "--flag",
      "--allow-file-access-from-files",
      "--shim",
      "/nix/store/x/yfs-direct-launch.js",
    ])
  })
})
