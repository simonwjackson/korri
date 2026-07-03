import { describe, expect, it } from "bun:test"
import {
  deviceStateFromBattery,
  deviceStatesEqual,
  failedBatteryReadState,
  normalizeBatterySnapshot,
  unknownDeviceState,
  type DevicePowerSupply,
} from "./device-facts"

const observedAt = "2026-07-01T00:00:00.000Z"

function supply(overrides: Partial<DevicePowerSupply>): DevicePowerSupply {
  return {
    name: "BAT0",
    type: "Battery",
    status: "Discharging",
    capacity: 82,
    online: null,
    voltageNow: null,
    currentNow: null,
    powerNow: null,
    modelName: null,
    ...overrides,
  }
}

describe("device facts battery normalization", () => {
  it("maps a battery supply with capacity to ready battery state", () => {
    const state = normalizeBatterySnapshot(
      { percent: 82, status: "Discharging", supplies: [supply({})] },
      observedAt,
    )

    expect(state).toMatchObject({
      _tag: "Ready",
      percent: 82,
      status: "Discharging",
      charging: false,
      observedAt,
    })
  })

  it("reports charging only for the Charging kernel status", () => {
    expect(
      normalizeBatterySnapshot(
        {
          percent: 82,
          status: "Charging",
          supplies: [supply({ status: "Charging" })],
        },
        observedAt,
      ),
    ).toMatchObject({ _tag: "Ready", charging: true })
    expect(
      normalizeBatterySnapshot(
        {
          percent: 100,
          status: "Full",
          supplies: [supply({ status: "Full" })],
        },
        observedAt,
      ),
    ).toMatchObject({ _tag: "Ready", charging: false })
  })

  it("treats power supplies without batteries as a normal no-battery state", () => {
    const state = normalizeBatterySnapshot(
      {
        percent: null,
        status: null,
        supplies: [supply({ name: "AC", type: "Mains", capacity: null })],
      },
      observedAt,
    )

    expect(state).toMatchObject({ _tag: "NoBattery", observedAt })
  })

  it("keeps malformed or missing capacity as an unknown ready percent", () => {
    const state = normalizeBatterySnapshot(
      {
        percent: Number.NaN,
        status: null,
        supplies: [supply({ capacity: null, status: null })],
      },
      observedAt,
    )

    expect(state).toMatchObject({ _tag: "Ready", percent: null, status: null })
  })

  it("turns failures before a ready value into read-error state", () => {
    const state = failedBatteryReadState(
      unknownDeviceState(observedAt).battery,
      new Error("EACCES"),
      observedAt,
    )

    expect(state).toEqual({ _tag: "ReadError", message: "EACCES", observedAt })
  })

  it("turns failures after a ready value into stale state with last-known battery", () => {
    const ready = normalizeBatterySnapshot(
      { percent: 82, status: "Discharging", supplies: [supply({})] },
      observedAt,
    )
    const state = failedBatteryReadState(ready, new Error("timeout"), "later")

    expect(state).toMatchObject({
      _tag: "Stale",
      message: "timeout",
      observedAt: "later",
      lastKnown: { _tag: "Ready", percent: 82 },
    })
  })

  it("compares device state by facts rather than observation timestamp", () => {
    const first = deviceStateFromBattery(
      normalizeBatterySnapshot(
        { percent: 82, status: "Discharging", supplies: [supply({})] },
        "t1",
      ),
      "t1",
    )
    const second = deviceStateFromBattery(
      normalizeBatterySnapshot(
        { percent: 82, status: "Discharging", supplies: [supply({})] },
        "t2",
      ),
      "t2",
    )

    expect(deviceStatesEqual(first, second)).toBe(true)
  })
})
