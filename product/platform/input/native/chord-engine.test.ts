import { describe, expect, it } from "bun:test"
import { BTN_A, BTN_SELECT, BTN_START, BTN_TL, BTN_TR } from "./button-codes"
import { createButtonChordEngine } from "./chord-engine"

const killChord = {
  id: "kill-current-game",
  requiredCodes: [BTN_TL, BTN_TR, BTN_SELECT, BTN_START],
  exact: true,
} as const

function gamepadEvent(code: number, value: number, deviceId = "gamepad-1") {
  return {
    deviceId,
    deviceClass: "gamepad" as const,
    type: 1,
    code,
    value,
  }
}

describe("button chord engine", () => {
  it("emits an exact chord once when all required buttons are pressed on one device", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    expect(engine.handleEvent(gamepadEvent(BTN_TL, 1))).toEqual([])
    expect(engine.handleEvent(gamepadEvent(BTN_TR, 1))).toEqual([])
    expect(engine.handleEvent(gamepadEvent(BTN_SELECT, 1))).toEqual([])
    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toEqual([
      { id: "kill-current-game", deviceId: "gamepad-1" },
    ])
  })

  it("does not emit for the old ROCKNIX L1+Select+Start subset", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    engine.handleEvent(gamepadEvent(BTN_TL, 1))
    engine.handleEvent(gamepadEvent(BTN_SELECT, 1))

    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toEqual([])
  })

  it("does not emit an exact destructive chord with extra buttons held", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    engine.handleEvent(gamepadEvent(BTN_A, 1))
    engine.handleEvent(gamepadEvent(BTN_TL, 1))
    engine.handleEvent(gamepadEvent(BTN_TR, 1))
    engine.handleEvent(gamepadEvent(BTN_SELECT, 1))

    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toEqual([])
    expect(engine.handleEvent(gamepadEvent(BTN_A, 0))).toEqual([])
  })

  it("does not emit repeatedly for held-button repeat events", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    engine.handleEvent(gamepadEvent(BTN_TL, 1))
    engine.handleEvent(gamepadEvent(BTN_TR, 1))
    engine.handleEvent(gamepadEvent(BTN_SELECT, 1))
    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toHaveLength(1)

    expect(engine.handleEvent(gamepadEvent(BTN_START, 2))).toEqual([])
    expect(engine.handleEvent(gamepadEvent(BTN_SELECT, 2))).toEqual([])
  })

  it("rearms after a required button is released", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    engine.handleEvent(gamepadEvent(BTN_TL, 1))
    engine.handleEvent(gamepadEvent(BTN_TR, 1))
    engine.handleEvent(gamepadEvent(BTN_SELECT, 1))
    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toHaveLength(1)

    expect(engine.handleEvent(gamepadEvent(BTN_START, 0))).toEqual([])
    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toEqual([
      { id: "kill-current-game", deviceId: "gamepad-1" },
    ])
  })

  it("does not assemble a chord from multiple devices", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    engine.handleEvent(gamepadEvent(BTN_TL, 1, "gamepad-1"))
    engine.handleEvent(gamepadEvent(BTN_TR, 1, "gamepad-1"))
    engine.handleEvent(gamepadEvent(BTN_SELECT, 1, "gamepad-2"))

    expect(engine.handleEvent(gamepadEvent(BTN_START, 1, "gamepad-2"))).toEqual(
      [],
    )
  })

  it("ignores unknown button codes", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    expect(engine.handleEvent(gamepadEvent(9999, 1))).toEqual([])
  })

  it("clears pressed state for a removed device", () => {
    const engine = createButtonChordEngine({ chords: [killChord] })

    engine.handleEvent(gamepadEvent(BTN_TL, 1))
    engine.handleEvent(gamepadEvent(BTN_TR, 1))
    engine.handleEvent(gamepadEvent(BTN_SELECT, 1))
    engine.clearDevice("gamepad-1")

    expect(engine.handleEvent(gamepadEvent(BTN_START, 1))).toEqual([])
  })
})
