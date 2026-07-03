import { describe, expect, it } from "bun:test"
import { parse } from "yaml"
import { renderInputConfigYaml } from "./input-config-render"
import { routeInputConfig } from "./input-mapping"

describe("renderInputConfigYaml", () => {
  it("renders per-player YAML that round-trips to the RPCS3 shape", () => {
    const text = renderInputConfigYaml(
      routeInputConfig({
        players: [
          {
            handler: "evdev",
            device: "Sunshine X-Box One (virtual) pad",
            buttons: { cross: "BTN_SOUTH" },
            sticks: { left: { deadzone: 40 } },
          },
          {
            handler: "keyboard",
            device: "Keyboard",
            buttons: { leftStickUp: "W" },
          },
        ],
      }),
    )
    expect(text).toBeString()
    const parsed = parse(text as string)
    expect(parsed["Player 1 Input"]).toEqual({
      Handler: "Evdev",
      Device: "Sunshine X-Box One (virtual) pad",
      Config: { Cross: "BTN_SOUTH", "Left Stick Deadzone": 40 },
    })
    expect(parsed["Player 2 Input"]).toEqual({
      Handler: "Keyboard",
      Device: "Keyboard",
      Config: { "Left Stick Up": "W" },
    })
  })

  it("pads the remaining slots up to seven with Null handlers", () => {
    const parsed = parse(
      renderInputConfigYaml(
        routeInputConfig({ players: [{ handler: "evdev" }] }),
      ) as string,
    )
    expect(parsed["Player 1 Input"]).toEqual({ Handler: "Evdev" })
    for (let n = 2; n <= 7; n++) {
      expect(parsed[`Player ${n} Input`]).toEqual({ Handler: "Null" })
    }
    expect(parsed["Player 8 Input"]).toBeUndefined()
  })

  it("omits the Config node for a bare player (partial profile)", () => {
    const parsed = parse(
      renderInputConfigYaml(
        routeInputConfig({
          players: [{ handler: "dualsense", device: "Wireless Controller" }],
        }),
      ) as string,
    )
    expect(parsed["Player 1 Input"]).toEqual({
      Handler: "DualSense",
      Device: "Wireless Controller",
    })
    expect("Config" in parsed["Player 1 Input"]).toBe(false)
  })

  it("returns undefined when there is nothing to render", () => {
    expect(renderInputConfigYaml(undefined)).toBeUndefined()
    expect(
      renderInputConfigYaml(routeInputConfig({ players: [] })),
    ).toBeUndefined()
  })
})
