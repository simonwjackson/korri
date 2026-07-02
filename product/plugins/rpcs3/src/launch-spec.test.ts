import { describe, expect, it } from "bun:test"

import { composeRpcs3LaunchSpec } from "./launch-spec"

describe("composeRpcs3LaunchSpec", () => {
  it("renders an RPCS3 no-gui launch for a game folder", () => {
    expect(
      composeRpcs3LaunchSpec({
        command: "/run/current-system/sw/bin/rpcs3",
        gameFolderPath: "/games/Skate 3 [BLUS30464]",
      }),
    ).toEqual({
      command: "/run/current-system/sw/bin/rpcs3",
      args: ["--no-gui", "/games/Skate 3 [BLUS30464]"],
    })
  })

  it("adds configured extra args before the game folder", () => {
    expect(
      composeRpcs3LaunchSpec({
        command: "/run/current-system/sw/bin/rpcs3",
        extraArgs: ["--foo"],
        gameFolderPath: "/games/Skate 3 [BLUS30464]",
      }).args,
    ).toEqual(["--no-gui", "--foo", "/games/Skate 3 [BLUS30464]"])
  })

  it("requires an absolute command and non-empty game folder", () => {
    expect(() =>
      composeRpcs3LaunchSpec({
        command: "rpcs3",
        gameFolderPath: "/games/Skate 3 [BLUS30464]",
      }),
    ).toThrow("RPCS3 launches require an absolute command")
    expect(() =>
      composeRpcs3LaunchSpec({
        command: "/run/current-system/sw/bin/rpcs3",
        gameFolderPath: " ",
      }),
    ).toThrow("RPCS3 launches require a game folder path")
  })
})
