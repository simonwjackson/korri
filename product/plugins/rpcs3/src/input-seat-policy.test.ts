import { describe, expect, it } from "bun:test"
import { INPUT_SEAT_PROVIDER_ID } from "@platform/input-seat/policy"
import {
  deriveRpcs3InputPolicyFromInputSeats,
  rpcs3InputPolicyWithInputSeats,
} from "./input-seat-policy"

describe("RPCS3 input-seat policy", () => {
  it("derives deterministic Evdev player bindings from P1-P4 input seats", () => {
    expect(
      deriveRpcs3InputPolicyFromInputSeats({
        [INPUT_SEAT_PROVIDER_ID]: { runtimeSupportsExtraSeats: true },
      }),
    ).toEqual({
      players: [
        { handler: "evdev", device: "Korri Seat P1" },
        { handler: "evdev", device: "Korri Seat P2" },
        { handler: "evdev", device: "Korri Seat P3" },
        { handler: "evdev", device: "Korri Seat P4" },
      ],
    })
  })

  it("honors opt-down policy", () => {
    expect(
      deriveRpcs3InputPolicyFromInputSeats({
        [INPUT_SEAT_PROVIDER_ID]: { playerCount: 1 },
      }),
    ).toEqual({ players: [{ handler: "evdev", device: "Korri Seat P1" }] })
  })

  it("applies derived seat defaults to every generated Korri Seat player", () => {
    expect(
      rpcs3InputPolicyWithInputSeats(
        {
          derivedSeatDefaults: {
            sticks: { right: { multiplier: 125 } },
          },
        },
        {
          [INPUT_SEAT_PROVIDER_ID]: { runtimeSupportsExtraSeats: true },
        },
      ),
    ).toEqual({
      players: [
        {
          handler: "evdev",
          device: "Korri Seat P1",
          sticks: { right: { multiplier: 125 } },
        },
        {
          handler: "evdev",
          device: "Korri Seat P2",
          sticks: { right: { multiplier: 125 } },
        },
        {
          handler: "evdev",
          device: "Korri Seat P3",
          sticks: { right: { multiplier: 125 } },
        },
        {
          handler: "evdev",
          device: "Korri Seat P4",
          sticks: { right: { multiplier: 125 } },
        },
      ],
    })
  })

  it("does not override explicit RPCS3 input policy", () => {
    const explicit = {
      players: [{ handler: "evdev" as const, device: "Hand Authored Pad" }],
      derivedSeatDefaults: {
        sticks: { right: { multiplier: 125 } },
      },
    }

    expect(
      rpcs3InputPolicyWithInputSeats(explicit, {
        [INPUT_SEAT_PROVIDER_ID]: { playerCount: 4 },
      }),
    ).toBe(explicit)
  })

  it("returns undefined when input-seat policy is absent or disabled", () => {
    expect(deriveRpcs3InputPolicyFromInputSeats(undefined)).toBeUndefined()
    expect(
      deriveRpcs3InputPolicyFromInputSeats({
        [INPUT_SEAT_PROVIDER_ID]: { playerCount: 0 },
      }),
    ).toBeUndefined()
  })
})
