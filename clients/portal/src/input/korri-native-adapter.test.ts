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
        JSON.stringify({ type: "direction", direction: "up", source: "gamepad" }),
      ),
    ).toEqual({ type: "direction", direction: "up", source: "gamepad" })
  })

  it("parses simple semantic events", () => {
    for (const type of [
      "confirm",
      "back",
      "menu",
      "options",
      "system",
    ] as const) {
      expect(parseBridgeInputEvent(JSON.stringify({ type }))).toEqual({
        type,
        source: "gamepad",
      })
    }
  })

  it("rejects malformed payloads", () => {
    expect(parseBridgeInputEvent("not json")).toBeNull()
    expect(parseBridgeInputEvent("42")).toBeNull()
    expect(parseBridgeInputEvent(JSON.stringify({ type: "warp" }))).toBeNull()
    expect(
      parseBridgeInputEvent(JSON.stringify({ type: "direction", direction: "in" })),
    ).toBeNull()
  })
})

describe("createKorriNativeAdapter", () => {
  it("registers the global, emits parsed actions, and cleans up", () => {
    const emitted: InputAction[] = []
    const stop = createKorriNativeAdapter().start(action => emitted.push(action))

    const host = window as unknown as Record<string, unknown>
    const push = host.__korriInput as (json: string) => void
    expect(typeof push).toBe("function")

    push(JSON.stringify({ type: "confirm" }))
    push("garbage")
    push(JSON.stringify({ type: "direction", direction: "left" }))

    expect(emitted).toEqual([
      { type: "confirm", source: "gamepad" },
      { type: "direction", direction: "left", source: "gamepad" },
    ])

    stop()
    expect(host.__korriInput).toBeUndefined()
  })
})
