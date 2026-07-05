import { describe, expect, it } from "bun:test"
import type { DeviceState } from "@platform/device/device-facts"
import {
  shiftBatteryPropsForPowerDisplay,
  shiftDeviceStateForPowerReading,
  shiftPowerDisplayForDeviceState,
  shiftPowerReadingForDeviceState,
} from "./shift-power-state"

function state(battery: DeviceState["battery"]): DeviceState {
  return {
    observedAt: "2026-07-01T00:00:00.000Z",
    battery,
    network: { _tag: "Unknown", observedAt: "2026-07-01T00:00:00.000Z" },
  }
}

describe("shiftDeviceStateForPowerReading", () => {
  it("maps a power reading to a Ready battery device fact", () => {
    expect(
      shiftDeviceStateForPowerReading(
        { percent: 82, charging: true },
        "2026-07-01T00:00:00.000Z",
      ),
    ).toEqual({
      observedAt: "2026-07-01T00:00:00.000Z",
      battery: {
        _tag: "Ready",
        percent: 82,
        status: "Charging",
        charging: true,
        supplies: [],
        observedAt: "2026-07-01T00:00:00.000Z",
      },
    })
  })

  it("reports a discharging status when not charging", () => {
    expect(
      shiftDeviceStateForPowerReading({ percent: 40, charging: false }, "t")
        .battery,
    ).toMatchObject({ status: "Discharging", charging: false })
  })
})

describe("Shift power state from device facts", () => {
  it("maps ready battery facts to status-bar battery props", () => {
    const display = shiftPowerDisplayForDeviceState(
      state({
        _tag: "Ready",
        percent: 82,
        status: "Charging",
        charging: true,
        supplies: [],
        observedAt: "2026-07-01T00:00:00.000Z",
      }),
    )

    expect(display).toEqual({ _tag: "Ready", percent: 82, charging: true })
    expect(shiftBatteryPropsForPowerDisplay(display)).toEqual({
      level: "full",
      charging: true,
    })
    expect(
      shiftBatteryPropsForPowerDisplay(display, { showPercent: true }),
    ).toEqual({
      level: "full",
      charging: true,
      percent: 82,
    })
    expect(
      shiftPowerReadingForDeviceState(
        state({
          _tag: "Ready",
          percent: 82,
          status: "Charging",
          charging: true,
          supplies: [],
          observedAt: "2026-07-01T00:00:00.000Z",
        }),
      ),
    ).toEqual({ percent: 82, charging: true })
  })

  it("does not render default battery props for no-battery or unknown states", () => {
    expect(
      shiftBatteryPropsForPowerDisplay(
        shiftPowerDisplayForDeviceState(
          state({ _tag: "NoBattery", supplies: [], observedAt: "now" }),
        ),
      ),
    ).toBeUndefined()
    expect(
      shiftBatteryPropsForPowerDisplay(
        shiftPowerDisplayForDeviceState(
          state({ _tag: "Unknown", observedAt: "now" }),
        ),
      ),
    ).toBeUndefined()
  })

  it("does not present stale device facts as fresh battery props", () => {
    const display = shiftPowerDisplayForDeviceState(
      state({
        _tag: "Stale",
        message: "timeout",
        observedAt: "later",
        lastKnown: {
          _tag: "Ready",
          percent: 40,
          status: "Discharging",
          charging: false,
          supplies: [],
          observedAt: "earlier",
        },
      }),
    )

    expect(display).toEqual({ _tag: "Stale", percent: 40, charging: false })
    expect(shiftBatteryPropsForPowerDisplay(display)).toBeUndefined()
  })
})
