import { describe, expect, test } from "bun:test"
import { isRuntimeConfigBridgeState } from "./runtime-config-bridge"

describe("isRuntimeConfigBridgeState", () => {
  test("accepts explicit desktop input flags", () => {
    expect(isRuntimeConfigBridgeState({ desktopInput: true })).toBe(true)
    expect(isRuntimeConfigBridgeState({ desktopInput: false })).toBe(true)
  })

  test("rejects missing desktopInput", () => {
    expect(isRuntimeConfigBridgeState({})).toBe(false)
  })

  test("rejects non-boolean desktopInput", () => {
    expect(isRuntimeConfigBridgeState({ desktopInput: "true" })).toBe(false)
    expect(isRuntimeConfigBridgeState({ desktopInput: 1 })).toBe(false)
    expect(isRuntimeConfigBridgeState({ desktopInput: undefined })).toBe(false)
  })

  test("rejects non-object values", () => {
    expect(isRuntimeConfigBridgeState(null)).toBe(false)
    expect(isRuntimeConfigBridgeState("hello")).toBe(false)
    expect(isRuntimeConfigBridgeState([])).toBe(false)
  })

  test("allows unknown extra keys for forward compatibility", () => {
    expect(
      isRuntimeConfigBridgeState({ desktopInput: true, extra: "ignored" }),
    ).toBe(true)
  })
})
