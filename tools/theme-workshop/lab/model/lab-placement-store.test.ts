import { afterEach, describe, expect, it } from "bun:test"
import { DEFAULT_PLACEMENT_PATTERN } from "./lab-canvas-placement"
import {
  getLabPlacementPattern,
  resetLabPlacementPatternForTest,
  setLabPlacementPattern,
} from "./lab-placement-store"

afterEach(() => {
  resetLabPlacementPatternForTest()
})

describe("lab placement store", () => {
  it("defaults to the spiral pattern", () => {
    expect(getLabPlacementPattern()).toBe(DEFAULT_PLACEMENT_PATTERN)
    expect(getLabPlacementPattern()).toBe("spiral")
  })

  it("updates and persists the chosen pattern", () => {
    setLabPlacementPattern("grid")
    expect(getLabPlacementPattern()).toBe("grid")
    expect(window.localStorage.getItem("lab-placement-pattern")).toBe("grid")
  })

  it("reads a previously persisted pattern on next hydrate", () => {
    resetLabPlacementPatternForTest()
    window.localStorage.setItem("lab-placement-pattern", "grid")
    expect(getLabPlacementPattern()).toBe("grid")
  })

  it("ignores an invalid persisted value and keeps the default", () => {
    resetLabPlacementPatternForTest()
    window.localStorage.setItem("lab-placement-pattern", "bogus")
    expect(getLabPlacementPattern()).toBe("spiral")
  })
})
