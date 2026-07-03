import { describe, expect, it } from "bun:test"
import { routeInputConfig } from "./input-mapping"

describe("routeInputConfig", () => {
  it("maps handler, device, and buttons to RPCS3 Config strings", () => {
    const routed = routeInputConfig({
      players: [
        {
          handler: "evdev",
          device: "Sunshine X-Box One (virtual) pad",
          buttons: { cross: "BTN_SOUTH", ps: "BTN_MODE" },
        },
      ],
    })
    expect(routed).toEqual({
      players: [
        {
          handler: "Evdev",
          device: "Sunshine X-Box One (virtual) pad",
          config: [
            ["Cross", "BTN_SOUTH"],
            ["PS Button", "BTN_MODE"],
          ],
        },
      ],
    })
  })

  it("maps every handler literal to its RPCS3 string", () => {
    const expected: Record<string, string> = {
      null: "Null",
      keyboard: "Keyboard",
      ds3: "DualShock 3",
      ds4: "DualShock 4",
      dualsense: "DualSense",
      skateboard: "Skateboard",
      move: "PS Move",
      sdl: "SDL",
      evdev: "Evdev",
    }
    for (const [clean, rpcs3] of Object.entries(expected)) {
      const routed = routeInputConfig({ players: [{ handler: clean as never }] })
      expect(routed?.players[0]?.handler).toBe(rpcs3)
    }
  })

  it("maps stick and trigger tuning to the RPCS3 Config keys", () => {
    const routed = routeInputConfig({
      players: [
        {
          handler: "evdev",
          sticks: {
            left: { deadzone: 40, multiplier: 120 },
            right: { deadzone: 30 },
          },
          triggers: { l2: { threshold: 20 }, r2: { threshold: 25 } },
        },
      ],
    })
    expect(routed?.players[0]?.config).toEqual([
      ["Left Stick Deadzone", 40],
      ["Left Stick Multiplier", 120],
      ["Right Stick Deadzone", 30],
      ["Left Trigger Threshold", 20],
      ["Right Trigger Threshold", 25],
    ])
  })

  it("maps keyboard-as-pad stick-direction bindings and mouse tuning", () => {
    const routed = routeInputConfig({
      players: [
        {
          handler: "keyboard",
          buttons: { leftStickUp: "W", leftStickDown: "S" },
          mouse: { movementMode: "absolute", deadzoneX: 60, accelerationX: 200 },
        },
      ],
    })
    expect(routed?.players[0]?.config).toEqual([
      ["Left Stick Up", "W"],
      ["Left Stick Down", "S"],
      ["Mouse Movement Mode", "Absolute"],
      ["Mouse Deadzone X Axis", 60],
      ["Mouse Acceleration X Axis", 200],
    ])
  })

  it("carries buddyDevice and yields an empty config for a bare player", () => {
    const routed = routeInputConfig({
      players: [{ handler: "dualsense", device: "Wireless Controller", buddyDevice: "Edge" }],
    })
    expect(routed).toEqual({
      players: [
        {
          handler: "DualSense",
          device: "Wireless Controller",
          buddyDevice: "Edge",
          config: [],
        },
      ],
    })
  })

  it("returns undefined when there are no players to route", () => {
    expect(routeInputConfig(undefined)).toBeUndefined()
    expect(routeInputConfig({})).toBeUndefined()
    expect(routeInputConfig({ players: [] })).toBeUndefined()
  })
})
