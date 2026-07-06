import { describe, expect, it } from "bun:test"
import { decodeInputSeatIdentity, inputSeatNameForSlot } from "./device-identity"

describe("input-seat identity", () => {
  it("creates deterministic P1-first safe seat names", () => {
    expect(inputSeatNameForSlot(1)).toBe("Korri Seat P1")
    expect(inputSeatNameForSlot(4)).toBe("Korri Seat P4")
  })

  it("accepts a stable emulator-visible descriptor", () => {
    const identity = decodeInputSeatIdentity({
      slot: 1,
      playerIndex: 0,
      name: "Korri Seat P1",
      backend: "evdev",
      deviceClass: "gamepad",
      capabilityProfile: "xbox360-gamepad",
      vendorId: "045e",
      productId: "028e",
      phys: "korri/input-seat/p1",
      uniq: "korri-seat-p1",
      eventPath: "/dev/input/event10",
      readiness: {
        readable: true,
        verifiedAt: "2026-07-06T00:00:00.000Z",
      },
    })

    expect(identity).toMatchObject({
      slot: 1,
      playerIndex: 0,
      name: "Korri Seat P1",
      backend: "evdev",
      capabilityProfile: "xbox360-gamepad",
    })
  })

  it("rejects config-injection characters in seat names", () => {
    for (const name of ["Korri Seat P1\nInjected: true", 'Korri "Seat"', "Korri\\Seat"]) {
      expect(() =>
        decodeInputSeatIdentity({
          slot: 1,
          playerIndex: 0,
          name,
          backend: "evdev",
          deviceClass: "gamepad",
          capabilityProfile: "xbox360-gamepad",
        }),
      ).toThrow()
    }
  })

  it("rejects out-of-range slots", () => {
    expect(() => inputSeatNameForSlot(0)).toThrow(/slot must be in \[1, 4\]/)
    expect(() => inputSeatNameForSlot(5)).toThrow(/slot must be in \[1, 4\]/)
  })
})
