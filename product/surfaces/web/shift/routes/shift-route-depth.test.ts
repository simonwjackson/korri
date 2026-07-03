import { describe, expect, it } from "bun:test"
import { shiftRouteDepth, shiftSlideDirection } from "./shift-route-depth"

describe("shiftRouteDepth", () => {
  it("places home at the root and detail deepest", () => {
    expect(shiftRouteDepth("/")).toBe(0)
    expect(shiftRouteDepth("/library")).toBe(1)
    expect(shiftRouteDepth("/companion")).toBe(1)
    expect(shiftRouteDepth("/game/hollow-knight")).toBe(2)
  })

  it("treats unknown routes as one level in", () => {
    expect(shiftRouteDepth("/anything-else")).toBe(1)
  })
})

describe("shiftSlideDirection", () => {
  it("is forward going deeper and back going shallower", () => {
    expect(shiftSlideDirection(0, 1)).toBe(1)
    expect(shiftSlideDirection(1, 2)).toBe(1)
    expect(shiftSlideDirection(2, 0)).toBe(-1)
    expect(shiftSlideDirection(1, 0)).toBe(-1)
  })

  it("is neutral for a same-depth swap", () => {
    expect(shiftSlideDirection(1, 1)).toBe(0)
  })
})
