import { describe, expect, it } from "bun:test"
import {
  DEFAULT_UI_SCALE,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  clampUiScale,
  formatUiScalePercent,
  parseUiScale,
  serializeUiScale,
} from "./ui-scale"

describe("ui scale helpers", () => {
  it("keeps valid scale values and formats them as percentages", () => {
    expect(clampUiScale(1.15)).toBe(1.15)
    expect(formatUiScalePercent(1.15)).toBe("115%")
    expect(serializeUiScale(1.15)).toBe("1.15")
  })

  it("clamps values below the minimum", () => {
    expect(clampUiScale(0.1)).toBe(MIN_UI_SCALE)
  })

  it("clamps values above the maximum", () => {
    expect(clampUiScale(5)).toBe(MAX_UI_SCALE)
  })

  it("falls back to the default for invalid input", () => {
    expect(clampUiScale(Number.NaN)).toBe(DEFAULT_UI_SCALE)
    expect(parseUiScale("not-a-number")).toBe(DEFAULT_UI_SCALE)
    expect(parseUiScale(null)).toBe(DEFAULT_UI_SCALE)
  })

  it("parses numeric strings through the same clamp", () => {
    expect(parseUiScale("1.3")).toBe(1.3)
    expect(parseUiScale("100")).toBe(MAX_UI_SCALE)
  })
})
