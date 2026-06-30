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
  it("defaults to the cascade pattern", () => {
    expect(getLabPlacementPattern()).toBe(DEFAULT_PLACEMENT_PATTERN)
    expect(getLabPlacementPattern()).toBe("cascade")
  })

  it("updates and persists the chosen pattern", () => {
    setLabPlacementPattern("spiral")
    expect(getLabPlacementPattern()).toBe("spiral")
    expect(window.localStorage.getItem("lab-placement-pattern")).toBe("spiral")
  })

  it("reads a previously persisted pattern on next hydrate", () => {
    resetLabPlacementPatternForTest()
    window.localStorage.setItem("lab-placement-pattern", "grid")
    expect(getLabPlacementPattern()).toBe("grid")
  })

  it("ignores an invalid persisted value and keeps the default", () => {
    resetLabPlacementPatternForTest()
    window.localStorage.setItem("lab-placement-pattern", "bogus")
    expect(getLabPlacementPattern()).toBe("cascade")
  })
})
