import { describe, expect, it } from "bun:test"
import type { DeviceState } from "@platform/device/device-facts"
import {
  DEFAULT_PICO_CLOCK_ISO,
  picoClockIsoForValue,
  picoClockLabelForIso,
} from "./pico-clock-state"
import {
  DEFAULT_PICO_NETWORK_READING,
  picoNetworkConnected,
  picoNetworkReadingForValue,
} from "./pico-network-state"
import {
  DEFAULT_PICO_POWER_READING,
  picoDeviceStateForPowerReading,
  picoPowerDisplayForDeviceState,
  picoPowerReadingForValue,
} from "./pico-power-state"

const OBSERVED = "2026-07-02T00:00:00.000Z"

describe("pico power state", () => {
  it("round-trips a reading through device-state to a Ready display", () => {
    const state = picoDeviceStateForPowerReading(
      { percent: 47, charging: true },
      OBSERVED,
    )
    expect(picoPowerDisplayForDeviceState(state)).toEqual({
      _tag: "Ready",
      percent: 47,
      charging: true,
    })
  })

  it("maps a Stale battery to its last-known reading", () => {
    const state: DeviceState = {
      observedAt: OBSERVED,
      battery: {
        _tag: "Stale",
        lastKnown: {
          _tag: "Ready",
          percent: 30,
          status: "Discharging",
          charging: false,
          supplies: [],
          observedAt: OBSERVED,
        },
        message: "stale",
        observedAt: OBSERVED,
      },
    }
    expect(picoPowerDisplayForDeviceState(state)).toEqual({
      _tag: "Stale",
      percent: 30,
      charging: false,
    })
  })

  it("hides on NoBattery and is Unknown on ReadError", () => {
    const noBattery: DeviceState = {
      observedAt: OBSERVED,
      battery: { _tag: "NoBattery", supplies: [], observedAt: OBSERVED },
    }
    const readError: DeviceState = {
      observedAt: OBSERVED,
      battery: { _tag: "ReadError", message: "boom", observedAt: OBSERVED },
    }
    expect(picoPowerDisplayForDeviceState(noBattery)).toEqual({
      _tag: "Hidden",
    })
    expect(picoPowerDisplayForDeviceState(readError)).toEqual({
      _tag: "Unknown",
    })
  })

  it("normalizes junk readings to the default", () => {
    expect(picoPowerReadingForValue(null)).toEqual(DEFAULT_PICO_POWER_READING)
    expect(picoPowerReadingForValue({ percent: 999, charging: "x" })).toEqual({
      percent: 100,
      charging: false,
    })
  })
})

describe("pico network state", () => {
  it("reports connectivity from the reading", () => {
    expect(picoNetworkConnected(DEFAULT_PICO_NETWORK_READING)).toBe(true)
    expect(picoNetworkConnected({ _tag: "Disconnected" })).toBe(false)
  })

  it("parses a Disconnected value and clamps strength", () => {
    expect(picoNetworkReadingForValue({ _tag: "Disconnected" })).toEqual({
      _tag: "Disconnected",
    })
    expect(
      picoNetworkReadingForValue({ _tag: "Connected", strengthPercent: -5 }),
    ).toEqual({ _tag: "Connected", strengthPercent: 0 })
  })
})

describe("pico clock state", () => {
  it("renders a compact 24-hour label", () => {
    expect(picoClockLabelForIso(DEFAULT_PICO_CLOCK_ISO)).toBe("10:24")
    expect(picoClockLabelForIso("2026-06-30T23:08:00.000Z")).toBe("23:08")
  })

  it("falls back to the default on an invalid instant", () => {
    expect(picoClockIsoForValue("not-a-date")).toBe(DEFAULT_PICO_CLOCK_ISO)
    expect(picoClockLabelForIso(undefined)).toBe("10:24")
  })
})
