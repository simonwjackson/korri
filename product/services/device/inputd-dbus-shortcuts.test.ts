import { describe, expect, it } from "bun:test"
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  BTN_BACK,
  BTN_MODE,
  BTN_SELECT,
  BTN_START,
  BTN_THUMBL,
  BTN_THUMBR,
  BTN_TL,
  BTN_TR,
  BTN_X,
  EV_ABS,
  EV_KEY,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
} from "@platform/input/native/button-codes"
import { dbusCapabilityToShortcutEvent } from "./inputd-dbus-shortcuts"

describe("dbusCapabilityToShortcutEvent", () => {
  it("maps the Guide/Home capability to BTN_MODE press and release", () => {
    expect(dbusCapabilityToShortcutEvent("ui_guide", 1)).toEqual({
      type: EV_KEY,
      code: BTN_MODE,
      value: 1,
    })
    expect(dbusCapabilityToShortcutEvent("ui_guide", 0)).toEqual({
      type: EV_KEY,
      code: BTN_MODE,
      value: 0,
    })
  })

  it("maps the shoulder and stick-click capabilities to their evdev buttons", () => {
    expect(dbusCapabilityToShortcutEvent("ui_l1", 1)?.code).toBe(BTN_TL)
    expect(dbusCapabilityToShortcutEvent("ui_r1", 1)?.code).toBe(BTN_TR)
    expect(dbusCapabilityToShortcutEvent("ui_l3", 1)?.code).toBe(BTN_THUMBL)
    expect(dbusCapabilityToShortcutEvent("ui_r3", 1)?.code).toBe(BTN_THUMBR)
  })

  it("maps start/select/back/osk to their evdev buttons", () => {
    expect(dbusCapabilityToShortcutEvent("ui_option", 1)?.code).toBe(BTN_START)
    expect(dbusCapabilityToShortcutEvent("ui_select", 1)?.code).toBe(BTN_SELECT)
    expect(dbusCapabilityToShortcutEvent("ui_back", 1)?.code).toBe(BTN_BACK)
    expect(dbusCapabilityToShortcutEvent("ui_osk", 1)?.code).toBe(BTN_X)
  })

  it("maps volume capabilities to key codes", () => {
    expect(dbusCapabilityToShortcutEvent("ui_volume_up", 1)?.code).toBe(
      KEY_VOLUMEUP,
    )
    expect(dbusCapabilityToShortcutEvent("ui_volume_down", 1)?.code).toBe(
      KEY_VOLUMEDOWN,
    )
  })

  it("maps the d-pad directions to hat-axis transitions and clears on release", () => {
    expect(dbusCapabilityToShortcutEvent("ui_up", 1)).toEqual({
      type: EV_ABS,
      code: ABS_HAT0Y,
      value: -1,
    })
    expect(dbusCapabilityToShortcutEvent("ui_down", 1)).toEqual({
      type: EV_ABS,
      code: ABS_HAT0Y,
      value: 1,
    })
    expect(dbusCapabilityToShortcutEvent("ui_left", 1)).toEqual({
      type: EV_ABS,
      code: ABS_HAT0X,
      value: -1,
    })
    expect(dbusCapabilityToShortcutEvent("ui_right", 1)).toEqual({
      type: EV_ABS,
      code: ABS_HAT0X,
      value: 1,
    })
    // Releasing any direction returns the hat axis to center.
    expect(dbusCapabilityToShortcutEvent("ui_up", 0)).toEqual({
      type: EV_ABS,
      code: ABS_HAT0Y,
      value: 0,
    })
    expect(dbusCapabilityToShortcutEvent("ui_right", 0)).toEqual({
      type: EV_ABS,
      code: ABS_HAT0X,
      value: 0,
    })
  })

  it("treats fractional press values above the midpoint as pressed", () => {
    expect(dbusCapabilityToShortcutEvent("ui_l1", 0.75)?.value).toBe(1)
    expect(dbusCapabilityToShortcutEvent("ui_l1", 0.25)?.value).toBe(0)
  })

  it("ignores capabilities that are not part of any shortcut chord", () => {
    expect(dbusCapabilityToShortcutEvent("ui_quick", 1)).toBeNull()
    expect(dbusCapabilityToShortcutEvent("ui_accept", 1)).toBeNull()
    expect(dbusCapabilityToShortcutEvent("ui_touch", 1)).toBeNull()
    expect(dbusCapabilityToShortcutEvent("ui_volume_mute", 1)).toBeNull()
  })
})
