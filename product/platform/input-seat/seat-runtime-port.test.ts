import { describe, expect, it } from "bun:test"
import { inputSeatNameForSlot } from "./device-identity"
import {
  createMemorySeatRuntime,
  makeRequestedSeat,
  validateGamepadCapabilityProfile,
} from "./seat-runtime-port"

describe("seat runtime port", () => {
  it("allocates N ready seats in deterministic order", async () => {
    const runtime = createMemorySeatRuntime()
    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1), makeRequestedSeat(2)],
      timeoutMs: 100,
    })

    expect(result.status).toBe("allocated")
    if (result.status === "allocated") {
      expect(result.seats.map(seat => seat.name)).toEqual([
        inputSeatNameForSlot(1),
        inputSeatNameForSlot(2),
      ])
      expect(result.seats.map(seat => seat.eventPath)).toEqual([
        "/dev/input/event101",
        "/dev/input/event102",
      ])
    }
  })

  it("times out delayed readiness without leaking allocated seats", async () => {
    const runtime = createMemorySeatRuntime({ readinessDelayMs: 50 })
    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 1,
    })

    expect(result).toMatchObject({ status: "unavailable", reason: "timeout" })
    expect(runtime.createdSlots()).toEqual([1])
    expect(runtime.releasedSlots()).toEqual([1])
  })

  it("rolls back partial allocation failures", async () => {
    const runtime = createMemorySeatRuntime({ failAtSlot: 2 })
    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1), makeRequestedSeat(2), makeRequestedSeat(3)],
      timeoutMs: 100,
    })

    expect(result).toMatchObject({ status: "unavailable", slot: 2 })
    expect(runtime.createdSlots()).toEqual([1])
    expect(runtime.releasedSlots()).toEqual([1])
  })

  it("rejects non-gamepad capability profiles", () => {
    expect(() => validateGamepadCapabilityProfile("keyboard" as never)).toThrow(
      /gamepad-only/,
    )
  })

  it("treats duplicate discovered identities as ambiguous", async () => {
    const runtime = createMemorySeatRuntime({
      duplicateName: inputSeatNameForSlot(1),
    })
    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 100,
    })

    expect(result).toMatchObject({ status: "ambiguous", slot: 1 })
    expect(runtime.releasedSlots()).toEqual([1])
  })

  it("honours cancellation during readiness", async () => {
    const runtime = createMemorySeatRuntime({ readinessDelayMs: 50 })
    const controller = new AbortController()
    const allocation = runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 1000,
      signal: controller.signal,
    })

    controller.abort()

    await expect(allocation).resolves.toMatchObject({
      status: "unavailable",
      reason: "cancelled",
    })
    expect(runtime.releasedSlots()).toEqual([1])
  })
})
