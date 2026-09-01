import { describe, expect, it } from "bun:test"
import {
  createKorriNativeAdapter,
  parseBridgeInputEvent,
} from "./korri-native-adapter"
import type { InputAction } from "./types"

describe("parseBridgeInputEvent", () => {
  it("parses direction events", () => {
    expect(
      parseBridgeInputEvent(
        JSON.stringify({
          type: "direction",
          direction: "up",
          repeat: true,
          releaseExpected: true,
          gestureId: 7,
          source: "gamepad",
        }),
      ),
    ).toEqual({
      type: "direction",
      direction: "up",
      repeat: true,
      releaseExpected: true,
      gestureId: 7,
      source: "gamepad",
    })
    expect(parseBridgeInputEvent(JSON.stringify({
      type: "direction-end",
      direction: "up",
      gestureId: 7,
      source: "gamepad",
    }))).toEqual({
      type: "direction-end",
      direction: "up",
      gestureId: 7,
      source: "gamepad",
    })
  })

  it("parses simple semantic events", () => {
    for (const type of [
      "confirm",
      "back",
      "menu",
      "options",
      "system",
    ] as const) {
      expect(parseBridgeInputEvent(JSON.stringify({ type, source: "gamepad" }))).toEqual({
        type,
        source: "gamepad",
      })
    }
  })

  it("rejects malformed payloads", () => {
    expect(parseBridgeInputEvent("not json")).toBeNull()
    expect(parseBridgeInputEvent("42")).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({ type: "warp" }))).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({
      type: "confirm",
      source: "keyboard",
    }))).toBeNull()
    expect(
      parseBridgeInputEvent(JSON.stringify({ type: "direction", direction: "in" })),
    ).toBeNull()
    expect(
      parseBridgeInputEvent(
        JSON.stringify({ type: "direction", direction: "left", repeat: "yes" }),
      ),
    ).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({
      type: "direction",
      direction: "left",
      releaseExpected: "yes",
      source: "gamepad",
    }))).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({
      type: "direction",
      direction: "left",
      releaseExpected: true,
      source: "gamepad",
    }))).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({
      type: "direction",
      direction: "left",
      releaseExpected: false,
      gestureId: 1,
      source: "gamepad",
    }))).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({
      type: "direction-end",
      direction: "left",
      source: "gamepad",
    }))).toBeNull()
  })
})

describe("createKorriNativeAdapter", () => {
  it("registers the global, emits parsed actions, and cleans up", () => {
    const emitted: InputAction[] = []
    const stop = createKorriNativeAdapter().start(action => emitted.push(action))

    const host = window as unknown as Record<string, unknown>
    const push = host.__korriInput as (json: string) => void
    expect(typeof push).toBe("function")

    push(JSON.stringify({ type: "confirm", source: "gamepad" }))
    push("garbage")
    push(JSON.stringify({
      type: "direction",
      direction: "left",
      releaseExpected: true,
      gestureId: 9,
      source: "gamepad",
    }))
    push(JSON.stringify({
      type: "direction-end",
      direction: "left",
      gestureId: 9,
      source: "gamepad",
    }))

    expect(emitted).toEqual([
      { type: "confirm", source: "gamepad" },
      {
        type: "direction",
        direction: "left",
        releaseExpected: true,
        gestureId: 9,
        source: "gamepad",
      },
      {
        type: "direction-end",
        direction: "left",
        gestureId: 9,
        source: "gamepad",
      },
    ])

    stop()
    expect(host.__korriInput).toBeUndefined()
  })
})
