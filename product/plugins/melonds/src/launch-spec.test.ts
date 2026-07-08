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

it("wraps matched presentation launches with the packaged presenter", () => {
  expect(
    composeMelonDsLaunchSpec({
      command: COMMAND,
      contentPath: ROM,
      policy: {
        display: { mode: "dual-window" },
        presentation: {
          intent: "matched-dual-screen",
          wayland: {
            display: "wayland-1",
            compositorSocket: "/run/user/1000/sway-ipc.sock",
          },
          windows: {
            top: { output: "TOP", x: 407, y: 250, width: 1106, height: 830 },
            bottom: { output: "BOTTOM", x: 0, y: 0, width: 1240, height: 930 },
          },
        },
      },
      presenterCommand: "/run/current-system/sw/bin/korri-melonds-presenter",
      presentationPayloadPath:
        "/var/lib/korri/melonDS/presentation/matched-dual-screen.json",
    }),
  ).toEqual({
    command: "/run/current-system/sw/bin/korri-melonds-presenter",
    args: [
      "--payload",
      "/var/lib/korri/melonDS/presentation/matched-dual-screen.json",
    ],
  })
})
