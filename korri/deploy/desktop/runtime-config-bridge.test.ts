import { describe, expect, test } from "bun:test"

import { isRuntimeConfigBridgeState } from "./runtime-config-bridge"

describe("isRuntimeConfigBridgeState", () => {
  test("accepts a populated native bridge URL", () => {
    expect(
      isRuntimeConfigBridgeState({
        nativeBridgeUrl: "ws://127.0.0.1:3002",
      }),
    ).toBe(true)
  })

  test("accepts an explicit null native bridge URL", () => {
    expect(isRuntimeConfigBridgeState({ nativeBridgeUrl: null })).toBe(true)
  })

  test("rejects when the field is missing", () => {
    expect(isRuntimeConfigBridgeState({})).toBe(false)
  })

  test("rejects when nativeBridgeUrl is a number", () => {
    expect(isRuntimeConfigBridgeState({ nativeBridgeUrl: 42 })).toBe(false)
  })

  test("rejects when nativeBridgeUrl is undefined", () => {
    expect(isRuntimeConfigBridgeState({ nativeBridgeUrl: undefined })).toBe(
      false,
    )
  })

  test("rejects non-object payloads", () => {
    expect(isRuntimeConfigBridgeState(null)).toBe(false)
    expect(isRuntimeConfigBridgeState(undefined)).toBe(false)
    expect(isRuntimeConfigBridgeState("ws://127.0.0.1:3002")).toBe(false)
    expect(isRuntimeConfigBridgeState(42)).toBe(false)
    expect(isRuntimeConfigBridgeState([])).toBe(false)
  })

  test("tolerates extra fields (structural guard)", () => {
    expect(
      isRuntimeConfigBridgeState({
        nativeBridgeUrl: "ws://127.0.0.1:3002",
        extra: "ignored",
      }),
    ).toBe(true)
  })
})
