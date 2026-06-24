import { describe, expect, it } from "bun:test"
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  BTN_MODE,
  BTN_SELECT,
  BTN_START,
  BTN_TL,
  BTN_TR,
  EV_ABS,
  EV_KEY,
  KEY_RECORD,
  KEY_SYSTEM,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
} from "./button-codes"
import { createSystemShortcutEngine } from "./system-shortcut-engine"

const shortcuts = [
  {
    id: "kill-current-game",
    requiredControls: ["l1", "r1", "start", "select"],
    exact: true,
  },
  {
    id: "workspace-prev",
    requiredControls: ["home", "dpad-left"],
  },
  {
    id: "move-output-down",
    requiredControls: ["home", "dpad-down"],
  },
  {
    id: "screen-switch",
    requiredControls: ["home", "back"],
  },
  {
    id: "brightness-up",
    requiredControls: ["home", "volume-up"],
  },
] as const

const taps = [{ id: "system-panel", control: "home" }] as const

function input(code: number, value: number, deviceId = "gamepad") {
  return {
    deviceId,
    deviceClass: "gamepad" as const,
    type: EV_KEY,
    code,
    value,
  }
}

function home(value: number) {
  return {
    deviceId: "gpio-keys",
    deviceClass: "system" as const,
    type: EV_KEY,
    code: KEY_SYSTEM,
    value,
  }
}

function abs(code: number, value: number) {
  return {
    deviceId: "gamepad",
    deviceClass: "gamepad" as const,
    type: EV_ABS,
    code,
    value,
  }
}

describe("system shortcut engine", () => {
  it("matches gamepad-only kill chord", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    expect(engine.handleEvent(input(BTN_TL, 1))).toEqual([])
    expect(engine.handleEvent(input(BTN_TR, 1))).toEqual([])
    expect(engine.handleEvent(input(BTN_START, 1))).toEqual([])
    expect(engine.handleEvent(input(BTN_SELECT, 1))).toEqual([
      { id: "kill-current-game" },
    ])
  })

  it("fires a plain Home tap on release when no chord consumed it", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    expect(engine.handleEvent(home(1))).toEqual([])
    expect(engine.handleEvent(home(0))).toEqual([{ id: "system-panel" }])
  })

  it("does not fire Home tap after a Home chord", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(home(1))
    expect(engine.handleEvent(abs(ABS_HAT0X, -1))).toEqual([
      { id: "workspace-prev" },
    ])
    expect(engine.handleEvent(home(0))).toEqual([])
  })

  it("maps hat directions while Home is held", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(home(1))
    expect(engine.handleEvent(abs(ABS_HAT0X, -1))).toEqual([
      { id: "workspace-prev" },
    ])
    expect(engine.handleEvent(abs(ABS_HAT0X, 0))).toEqual([])
    expect(engine.handleEvent(abs(ABS_HAT0Y, 1))).toEqual([
      { id: "move-output-down" },
    ])
  })

  it("maps the AYN physical Back key to the screen-switch chord", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(home(1))
    expect(engine.handleEvent(input(KEY_RECORD, 1))).toEqual([
      { id: "screen-switch" },
    ])
  })

  it("maps Home plus volume to brightness without firing on volume alone", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    expect(engine.handleEvent(input(KEY_VOLUMEUP, 1, "gpio-keys"))).toEqual([])
    engine.handleEvent(input(KEY_VOLUMEUP, 0, "gpio-keys"))
    engine.handleEvent(home(1))
    expect(engine.handleEvent(input(KEY_VOLUMEUP, 1, "gpio-keys"))).toEqual([
      { id: "brightness-up" },
    ])
    expect(engine.handleEvent(input(KEY_VOLUMEDOWN, 1, "gpio-keys"))).toEqual(
      [],
    )
  })

  it("treats gamepad Home/Guide as the Home shortcut control", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(input(BTN_MODE, 1))
    expect(engine.handleEvent(abs(ABS_HAT0X, -1))).toEqual([
      { id: "workspace-prev" },
    ])
    expect(engine.handleEvent(input(KEY_VOLUMEUP, 1, "gpio-keys"))).toEqual([
      { id: "brightness-up" },
    ])
  })

  it("ignores held repeats for one-shot chords", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(input(BTN_TL, 1))
    engine.handleEvent(input(BTN_TR, 1))
    engine.handleEvent(input(BTN_START, 1))
    expect(engine.handleEvent(input(BTN_SELECT, 1))).toHaveLength(1)
    expect(engine.handleEvent(input(BTN_SELECT, 2))).toEqual([])
  })

  it("clears controls for removed devices", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(input(BTN_TL, 1))
    engine.clearDevice("gamepad")
    engine.handleEvent(input(BTN_TR, 1))
    engine.handleEvent(input(BTN_START, 1))
    expect(engine.handleEvent(input(BTN_SELECT, 1))).toEqual([])
  })
})
