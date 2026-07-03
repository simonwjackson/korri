import { describe, expect, it } from "bun:test"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import { decodeRpcs3Policy } from "./policy"

describe("decodeRpcs3Policy — input authoring", () => {
  it("decodes a two-player tree (evdev pad + keyboard-as-pad)", () => {
    const input = {
      players: [
        {
          handler: "evdev",
          device: "Sunshine X-Box One (virtual) pad",
          buttons: { cross: "Cross", circle: "Circle" },
          sticks: {
            left: { deadzone: 40, multiplier: 100 },
            right: { deadzone: 30 },
          },
          triggers: { l2: { threshold: 20 } },
        },
        {
          handler: "keyboard",
          device: "Keyboard",
          buttons: { cross: "Return", leftStickUp: "W" },
          mouse: { movementMode: "relative", deadzoneX: 60 },
        },
      ],
    } as const
    expect(decodeRpcs3Policy({ input })).toEqual({ input })
  })

  it("decodes an empty input, an empty players list, and a handler-only player", () => {
    expect(decodeRpcs3Policy({ input: {} })).toEqual({ input: {} })
    expect(decodeRpcs3Policy({ input: { players: [] } })).toEqual({
      input: { players: [] },
    })
    expect(
      decodeRpcs3Policy({ input: { players: [{ handler: "null" }] } }),
    ).toEqual({ input: { players: [{ handler: "null" }] } })
  })

  it("accepts every Linux-available handler literal", () => {
    for (const handler of [
      "null",
      "keyboard",
      "ds3",
      "ds4",
      "dualsense",
      "skateboard",
      "move",
      "sdl",
      "evdev",
    ] as const) {
      expect(decodeRpcs3Policy({ input: { players: [{ handler }] } })).toEqual({
        input: { players: [{ handler }] },
      })
    }
  })

  it("rejects a Windows-only handler and an unknown handler naming the path", () => {
    // xinput / mm are _WIN32-only in RPCS3; Korri targets Linux devices.
    expectPolicyError(() =>
      decodeRpcs3Policy({ input: { players: [{ handler: "xinput" }] } }),
    )
    expectPolicyError(
      () => decodeRpcs3Policy({ input: { players: [{ handler: "gamepad" }] } }),
      "handler",
    )
  })

  it("rejects an unknown button key naming the offending path", () => {
    expectPolicyError(
      () =>
        decodeRpcs3Policy({
          input: { players: [{ handler: "evdev", buttons: { crss: "X" } }] },
        }),
      "crss",
    )
  })

  it("rejects out-of-range stick/trigger/mouse tuning", () => {
    expectPolicyError(() =>
      decodeRpcs3Policy({
        input: {
          players: [
            { handler: "evdev", sticks: { left: { multiplier: 500 } } },
          ],
        },
      }),
    )
    expectPolicyError(() =>
      decodeRpcs3Policy({
        input: {
          players: [{ handler: "evdev", triggers: { r2: { threshold: -1 } } }],
        },
      }),
    )
    expectPolicyError(() =>
      decodeRpcs3Policy({
        input: {
          players: [{ handler: "keyboard", mouse: { deadzoneX: 999 } }],
        },
      }),
    )
  })

  it("accepts up to seven players but rejects an eighth (RPCS3 has 7 slots)", () => {
    const seven = Array.from({ length: 7 }, () => ({
      handler: "null" as const,
    }))
    expect(decodeRpcs3Policy({ input: { players: seven } })).toEqual({
      input: { players: seven },
    })
    const eight = Array.from({ length: 8 }, () => ({ handler: "null" }))
    expectPolicyError(() => decodeRpcs3Policy({ input: { players: eight } }))
  })

  it("rejects an invalid mouse movement mode", () => {
    expectPolicyError(() =>
      decodeRpcs3Policy({
        input: {
          players: [{ handler: "keyboard", mouse: { movementMode: "warp" } }],
        },
      }),
    )
  })
})

function expectPolicyError(run: () => unknown, needle?: string): void {
  try {
    run()
    throw new Error("expected policy decode to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(AppMaterializationFailed)
    if (needle !== undefined) {
      expect((error as AppMaterializationFailed).reason).toContain(needle)
    }
  }
}
