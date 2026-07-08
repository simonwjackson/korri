import { describe, expect, it } from "bun:test"
import { composeMelonDsLaunchSpec } from "./launch-spec"

const COMMAND = "/run/current-system/sw/bin/melonDS"
const ROM = "/games/nds/Mario Kart DS.nds"

describe("composeMelonDsLaunchSpec", () => {
  it("launches melonDS with the ROM path as the trailing positional argument", () => {
    expect(
      composeMelonDsLaunchSpec({ command: COMMAND, contentPath: ROM }),
    ).toEqual({
      command: COMMAND,
      args: [ROM],
    })
  })

  it("adds fullscreen as a routed flag", () => {
    expect(
      composeMelonDsLaunchSpec({
        command: COMMAND,
        contentPath: ROM,
        policy: { video: { fullscreen: true } },
      }),
    ).toEqual({ command: COMMAND, args: ["--fullscreen", ROM] })
  })

  it("applies raw argv overrides without removing the ROM positional", () => {
    expect(
      composeMelonDsLaunchSpec({
        command: COMMAND,
        contentPath: ROM,
        policy: { video: { fullscreen: true } },
        overridesArgs: {
          prepend: ["--boot", "never"],
          replace: ["--fullscreen", "--archive-file", "game.nds"],
          append: ["/games/slot2.gba"],
        },
      }),
    ).toEqual({
      command: COMMAND,
      args: [
        "--boot",
        "never",
        "--fullscreen",
        "--archive-file",
        "game.nds",
        "/games/slot2.gba",
        ROM,
      ],
    })
  })

  it("rejects relative commands and empty content paths", () => {
    expect(() =>
      composeMelonDsLaunchSpec({ command: "melonDS", contentPath: ROM }),
    ).toThrow("absolute command")
    expect(() =>
      composeMelonDsLaunchSpec({ command: COMMAND, contentPath: " " }),
    ).toThrow("ROM path")
  })
})
