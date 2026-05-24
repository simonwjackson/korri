import { describe, expect, test } from "bun:test"
import { isRuntimeConfig } from "./runtime-config-shape"

describe("isRuntimeConfig", () => {
  test("accepts explicit desktop input flags", () => {
    expect(isRuntimeConfig({ desktopInput: true })).toBe(true)
    expect(isRuntimeConfig({ desktopInput: false })).toBe(true)
  })

  test("rejects missing desktopInput", () => {
    expect(isRuntimeConfig({})).toBe(false)
  })

  test("rejects non-boolean desktopInput", () => {
    expect(isRuntimeConfig({ desktopInput: "true" })).toBe(false)
    expect(isRuntimeConfig({ desktopInput: 1 })).toBe(false)
    expect(isRuntimeConfig({ desktopInput: undefined })).toBe(false)
  })

  test("rejects non-object values", () => {
    expect(isRuntimeConfig(null)).toBe(false)
    expect(isRuntimeConfig("hello")).toBe(false)
    expect(isRuntimeConfig([])).toBe(false)
  })

  test("allows unknown extra keys for forward compatibility", () => {
    expect(isRuntimeConfig({ desktopInput: true, extra: "ignored" })).toBe(true)
  })
})
