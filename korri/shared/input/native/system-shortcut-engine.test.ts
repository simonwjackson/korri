import { describe, expect, it } from "bun:test"
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  BTN_MODE,
  BTN_START,
  BTN_THUMBL,
  BTN_THUMBR,
  BTN_TL,
  BTN_TR,
  EV_ABS,
  EV_KEY,
  KEY_SYSTEM,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
} from "./button-codes"
import { createSystemShortcutEngine } from "./system-shortcut-engine"

const shortcuts = [
  {
    id: "kill-current-game",
    requiredControls: ["system", "l1", "r1"],
    exact: true,
  },
  {
    id: "workspace-prev",
    requiredControls: ["system", "dpad-left"],
  },
  {
    id: "move-output-down",
    requiredControls: ["system", "dpad-down"],
  },
  {
    id: "brightness-up",
    requiredControls: ["system", "volume-up"],
  },
] as const

const taps = [{ id: "system-panel", control: "system" }] as const

function input(code: number, value: number, deviceId = "gamepad") {
  return { deviceId, deviceClass: "gamepad" as const, type: EV_KEY, code, value }
}

function system(value: number) {
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
  it("matches System plus shoulders across devices", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    expect(engine.handleEvent(system(1))).toEqual([])
    expect(engine.handleEvent(input(BTN_TL, 1))).toEqual([])
    expect(engine.handleEvent(input(BTN_TR, 1))).toEqual([
      { id: "kill-current-game" },
    ])
  })

  it("fires a plain System tap on release when no chord consumed it", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    expect(engine.handleEvent(system(1))).toEqual([])
    expect(engine.handleEvent(system(0))).toEqual([{ id: "system-panel" }])
  })

  it("does not also fire System tap after a System chord", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(system(1))
    engine.handleEvent(input(BTN_TL, 1))
    expect(engine.handleEvent(input(BTN_TR, 1))).toEqual([
      { id: "kill-current-game" },
    ])
    expect(engine.handleEvent(system(0))).toEqual([])
  })

  it("maps hat directions while System is held", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(system(1))
    expect(engine.handleEvent(abs(ABS_HAT0X, -1))).toEqual([
      { id: "workspace-prev" },
    ])
    expect(engine.handleEvent(abs(ABS_HAT0X, 0))).toEqual([])
    expect(engine.handleEvent(abs(ABS_HAT0Y, 1))).toEqual([
      { id: "move-output-down" },
    ])
  })

  it("maps System plus volume to brightness without firing on volume alone", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    expect(engine.handleEvent(input(KEY_VOLUMEUP, 1, "gpio-keys"))).toEqual([])
    engine.handleEvent(input(KEY_VOLUMEUP, 0, "gpio-keys"))
    engine.handleEvent(system(1))
    expect(engine.handleEvent(input(KEY_VOLUMEUP, 1, "gpio-keys"))).toEqual([
      { id: "brightness-up" },
    ])
    expect(engine.handleEvent(input(KEY_VOLUMEDOWN, 1, "gpio-keys"))).toEqual(
      [],
    )
  })

  it("does not treat Home/Guide as System", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(input(BTN_MODE, 1))
    engine.handleEvent(input(BTN_TL, 1))
    expect(engine.handleEvent(input(BTN_TR, 1))).toEqual([])
  })

  it("ignores held repeats for one-shot chords", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(system(1))
    engine.handleEvent(input(BTN_TL, 1))
    expect(engine.handleEvent(input(BTN_TR, 1))).toHaveLength(1)
    expect(engine.handleEvent(input(BTN_TR, 2))).toEqual([])
  })

  it("clears controls for removed devices", () => {
    const engine = createSystemShortcutEngine({ shortcuts, taps })

    engine.handleEvent(system(1))
    engine.clearDevice("gpio-keys")
    engine.handleEvent(input(BTN_TL, 1))
    expect(engine.handleEvent(input(BTN_TR, 1))).toEqual([])
  })

  it("keeps the existing session chord expressible as a gamepad-only shortcut", () => {
    const engine = createSystemShortcutEngine({
      shortcuts: [
        {
          id: "korri-session-toggle",
          requiredControls: ["l3", "r3", "start"],
          exact: true,
        },
      ],
    })

    engine.handleEvent(input(BTN_THUMBL, 1))
    engine.handleEvent(input(BTN_THUMBR, 1))
    expect(engine.handleEvent(input(BTN_START, 1))).toEqual([
      { id: "korri-session-toggle" },
    ])
  })
})
