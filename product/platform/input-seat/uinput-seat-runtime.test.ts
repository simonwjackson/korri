import { describe, expect, it } from "bun:test"
import type { DiscoveredDevice } from "@platform/input/native/discover-devices"
import { inputSeatNameForSlot } from "./device-identity"
import { makeRequestedSeat } from "./seat-runtime-port"
import {
  createUinputSeatRuntime,
  type UinputSeatBackend,
} from "./uinput-seat-runtime"

const gamepadDevice = (slot: number, eventNode = `event${slot}`): DiscoveredDevice => ({
  deviceId: `korri-seat-p${slot}`,
  class: "gamepad",
  name: inputSeatNameForSlot(slot),
  eventNode,
  capabilities: ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"],
  physicalPath: `korri/input-seat/p${slot}`,
  uniqueId: `korri-seat-p${slot}`,
  sysfsPath: `/devices/virtual/input/korri-seat-p${slot}`,
})

const createBackend = (
  devices: () => readonly DiscoveredDevice[],
): UinputSeatBackend & {
  readonly created: number[]
  readonly released: number[]
  readonly writes: unknown[]
} => {
  const created: number[] = []
  const released: number[] = []
  const writes: unknown[] = []

  return {
    created,
    released,
    writes,
    createSeat: async seat => {
      created.push(seat.slot)
      return { slot: seat.slot, token: `handle-${seat.slot}` }
    },
    releaseSeat: async handle => {
      released.push(handle.slot)
    },
    discoverDevices: async () => devices(),
    writeGamepadState: async (handle, state) => {
      writes.push({ handle, state })
    },
  }
}

describe("uinput seat runtime", () => {
  it("allocates seats only after unique gamepad identities are discovered", async () => {
    const backend = createBackend(() => [gamepadDevice(1), gamepadDevice(2)])
    const runtime = createUinputSeatRuntime({ backend, inputRoot: "/dev/input" })

    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1), makeRequestedSeat(2)],
      timeoutMs: 100,
    })

    expect(result.status).toBe("allocated")
    if (result.status === "allocated") {
      expect(result.seats.map(seat => seat.eventPath)).toEqual([
        "/dev/input/event1",
        "/dev/input/event2",
      ])
      expect(result.seats.map(seat => seat.readiness?.readable)).toEqual([
        true,
        true,
      ])
    }
    expect(backend.created).toEqual([1, 2])
  })

  it("rejects ambiguous duplicate Korri seat names and releases created seats", async () => {
    const backend = createBackend(() => [gamepadDevice(1, "event1"), gamepadDevice(1, "event9")])
    const runtime = createUinputSeatRuntime({ backend })

    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 100,
    })

    expect(result).toMatchObject({ status: "ambiguous", slot: 1 })
    expect(backend.released).toEqual([1])
  })

  it("times out unreadiness and releases partial allocation", async () => {
    const backend = createBackend(() => [])
    const runtime = createUinputSeatRuntime({
      backend,
      pollIntervalMs: 1,
      nowMs: (() => {
        let now = 0
        return () => (now += 10)
      })(),
      sleepMs: async () => {},
    })

    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 5,
    })

    expect(result).toMatchObject({ status: "unavailable", reason: "timeout" })
    expect(backend.released).toEqual([1])
  })

  it("writes validated gamepad state to the allocated seat handle", async () => {
    const backend = createBackend(() => [gamepadDevice(1)])
    const runtime = createUinputSeatRuntime({ backend })
    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 100,
    })
    expect(result.status).toBe("allocated")
    if (result.status !== "allocated") throw new Error("allocation failed")

    await runtime.writeGamepadState(1, {
      buttons: 1,
      leftTrigger: 255,
      rightTrigger: 0,
      leftStickX: -32768,
      leftStickY: 32767,
      rightStickX: 0,
      rightStickY: 42,
    })

    expect(backend.writes).toHaveLength(1)
    expect(backend.writes[0]).toMatchObject({
      handle: { slot: 1, token: "handle-1" },
      state: { buttons: 1, leftTrigger: 255, leftStickX: -32768 },
    })
  })

  it("rejects unsupported gamepad state before reaching uinput", async () => {
    const backend = createBackend(() => [gamepadDevice(1)])
    const runtime = createUinputSeatRuntime({ backend })
    const result = await runtime.allocate({
      launchId: "launch-1",
      seats: [makeRequestedSeat(1)],
      timeoutMs: 100,
    })
    expect(result.status).toBe("allocated")

    await expect(
      runtime.writeGamepadState(1, {
        buttons: 0,
        leftTrigger: 300,
        rightTrigger: 0,
        leftStickX: 0,
        leftStickY: 0,
        rightStickX: 0,
        rightStickY: 0,
      }),
    ).rejects.toThrow(/leftTrigger/)
    expect(backend.writes).toHaveLength(0)
  })
})
