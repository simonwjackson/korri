import { describe, expect, it } from "bun:test"
import {
  shiftBatteryPropsForPowerDisplay,
  shiftPowerDisplayForDeviceState,
} from "./shift-power-state"
import type { DeviceState } from "@platform/device/device-facts"

function state(battery: DeviceState["battery"]): DeviceState {
  return { observedAt: "2026-07-01T00:00:00.000Z", battery }
}

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
