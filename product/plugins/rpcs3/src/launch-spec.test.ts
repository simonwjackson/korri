import { describe, expect, it } from "bun:test"

import { composeRpcs3LaunchSpec } from "./launch-spec"

const COMMAND = "/run/current-system/sw/bin/rpcs3"
const GAME = "/games/Skate 3 [BLUS30464]"

describe("composeRpcs3LaunchSpec", () => {
  it("renders a bare no-gui launch for a game folder", () => {
    expect(
      composeRpcs3LaunchSpec({ command: COMMAND, gameFolderPath: GAME }),
    ).toEqual({
      command: COMMAND,
      args: ["--no-gui", GAME],
    })
  })

  it("places routed flags and --config before the game folder", () => {
    expect(
      composeRpcs3LaunchSpec({
        command: COMMAND,
        gameFolderPath: GAME,
        flags: ["--fullscreen"],
        configPath: "/state/korri/config-skate3.yml",
      }).args,
    ).toEqual([
      "--no-gui",
      "--fullscreen",
      "--config",
      "/state/korri/config-skate3.yml",
      GAME,
    ])
  })

  it("emits --input-config after --config when provided", () => {
    expect(
      composeRpcs3LaunchSpec({
        command: COMMAND,
        gameFolderPath: GAME,
        configPath: "/state/korri/config-skate3.yml",
        inputConfig: "kiosk-pad",
      }).args,
    ).toEqual([
      "--no-gui",
      "--config",
      "/state/korri/config-skate3.yml",
      "--input-config",
      "kiosk-pad",
      GAME,
    ])
  })

  it("lands overrides.args prepend and append in the documented positions", () => {
    expect(
      composeRpcs3LaunchSpec({
        command: COMMAND,
        gameFolderPath: GAME,
        flags: ["--fullscreen"],
        configPath: "/c.yml",
        overridesArgs: { prepend: ["--pre"], append: ["--post"] },
      }).args,
    ).toEqual([
      "--no-gui",
      "--pre",
      "--fullscreen",
      "--config",
      "/c.yml",
      "--post",
      GAME,
    ])
  })

  it("replaces only the routed-flags segment with overrides.args.replace", () => {
    expect(
      composeRpcs3LaunchSpec({
        command: COMMAND,
        gameFolderPath: GAME,
        flags: ["--fullscreen", "--headless"],
        configPath: "/c.yml",
        overridesArgs: { replace: ["--raw-only"] },
      }).args,
    ).toEqual(["--no-gui", "--raw-only", "--config", "/c.yml", GAME])
  })

  it("requires an absolute command and non-empty game folder", () => {
    expect(() =>
      composeRpcs3LaunchSpec({ command: "rpcs3", gameFolderPath: GAME }),
    ).toThrow("RPCS3 launches require an absolute command")
    expect(() =>
      composeRpcs3LaunchSpec({ command: COMMAND, gameFolderPath: " " }),
    ).toThrow("RPCS3 launches require a game folder path")
  })
})
