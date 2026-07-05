import { describe, expect, it } from "bun:test"
import {
  type DevicePowerSupply,
  deviceStateFromFacts,
  deviceStatesEqual,
  failedBatteryReadState,
  failedNetworkReadState,
  normalizeBatterySnapshot,
  normalizeNetworkSnapshot,
  unknownDeviceState,
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

describe("device facts network normalization", () => {
  it("maps connected wifi with signal to ready network state", () => {
    expect(
      normalizeNetworkSnapshot(
        { connected: true, kind: "wifi", strengthPercent: 82 },
        observedAt,
      ),
    ).toEqual({
      _tag: "Connected",
      kind: "wifi",
      strengthPercent: 82,
      observedAt,
    })
  })

  it("maps disconnected network to disconnected state", () => {
    expect(
      normalizeNetworkSnapshot(
        { connected: false, kind: "ethernet", strengthPercent: null },
        observedAt,
      ),
    ).toEqual({ _tag: "Disconnected", observedAt })
  })

  it("keeps unknown connectivity distinct from disconnected", () => {
    expect(
      normalizeNetworkSnapshot(
        { connected: null, kind: null, strengthPercent: null },
        observedAt,
      ),
    ).toEqual({ _tag: "Unknown", observedAt })
  })

  it("clamps malformed signal strength", () => {
    expect(
      normalizeNetworkSnapshot(
        { connected: true, kind: "wifi", strengthPercent: 140 },
        observedAt,
      ),
    ).toMatchObject({ _tag: "Connected", strengthPercent: 100 })
  })

  it("turns failures after a known value into stale network state", () => {
    const ready = normalizeNetworkSnapshot(
      { connected: true, kind: "wifi", strengthPercent: 70 },
      observedAt,
    )
    const state = failedNetworkReadState(ready, new Error("net busy"), "later")

    expect(state).toMatchObject({
      _tag: "Stale",
      message: "net busy",
      observedAt: "later",
      lastKnown: { _tag: "Connected", strengthPercent: 70 },
    })
  })
})

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
    const first = deviceStateFromFacts({
      battery: normalizeBatterySnapshot(
        { percent: 82, status: "Discharging", supplies: [supply({})] },
        "t1",
      ),
      network: normalizeNetworkSnapshot(
        { connected: true, kind: "wifi", strengthPercent: 82 },
        "t1",
      ),
      observedAt: "t1",
    })
    const second = deviceStateFromFacts({
      battery: normalizeBatterySnapshot(
        { percent: 82, status: "Discharging", supplies: [supply({})] },
        "t2",
      ),
      network: normalizeNetworkSnapshot(
        { connected: true, kind: "wifi", strengthPercent: 82 },
        "t2",
      ),
      observedAt: "t2",
    })

    expect(deviceStatesEqual(first, second)).toBe(true)
  })
})
