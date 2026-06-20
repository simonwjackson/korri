import { describe, expect, it } from "bun:test"
import { gamescopeCliArgs } from "./gamescope-cli"

describe("gamescopeCliArgs", () => {
  it("builds nested gamescope argv with pixel scaling at the internal res", () => {
    expect(
      gamescopeCliArgs({
        internal: { width: 1028, height: 740 },
        output: { width: 1920, height: 1080 },
        filter: "pixel",
      }),
    ).toEqual([
      "--backend",
      "wayland",
      "-W",
      "1920",
      "-H",
      "1080",
      "-w",
      "1028",
      "-h",
      "740",
      "-r",
      "60",
      "-S",
      "fit",
      "-F",
      "pixel",
      "-f",
      "--force-windows-fullscreen",
    ])
  })

  it("honors a custom refresh rate", () => {
    expect(
      gamescopeCliArgs({
        internal: { width: 832, height: 448 },
        output: { width: 1920, height: 1080 },
        filter: "linear",
        refresh: 120,
      }),
    ).toContain("120")
  })
})
