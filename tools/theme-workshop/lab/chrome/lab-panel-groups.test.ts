import { describe, expect, it } from "bun:test"
import {
  areAdjacent,
  computeGroups,
  type Rect,
  reflowStack,
  snapToNeighbors,
  unionBBox,
} from "./lab-panel-groups"

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
})

describe("areAdjacent", () => {
  it("treats vertically stacked, edge-sharing panels as adjacent", () => {
    expect(areAdjacent(rect(0, 0, 200, 100), rect(0, 100, 200, 100))).toBe(true)
  })

  it("does not treat side-by-side panels as adjacent (vertical-only stacking)", () => {
    expect(areAdjacent(rect(0, 0, 200, 100), rect(200, 0, 200, 100))).toBe(
      false,
    )
  })

  it("does not link panels separated by a gap", () => {
    expect(areAdjacent(rect(0, 0, 200, 100), rect(0, 140, 200, 100))).toBe(
      false,
    )
  })

  it("requires meaningful overlap along the shared edge", () => {
    // Touch only at a corner: shared extent is below the overlap minimum.
    expect(areAdjacent(rect(0, 0, 200, 100), rect(198, 100, 200, 100))).toBe(
      false,
    )
  })
})

describe("computeGroups", () => {
  it("groups a flush stack and leaves a distant panel alone", () => {
    const groups = computeGroups(["a", "b", "c"], {
      a: rect(0, 0, 200, 100),
      b: rect(0, 100, 200, 100),
      c: rect(600, 600, 200, 100),
    })
    const sorted = groups.map(g => g.slice().sort()).sort()
    expect(sorted).toEqual([["a", "b"], ["c"]])
  })

  it("links a transitive chain into one group", () => {
    const groups = computeGroups(["a", "b", "c"], {
      a: rect(0, 0, 200, 100),
      b: rect(0, 100, 200, 100),
      c: rect(0, 200, 200, 100),
    })
    expect(groups).toHaveLength(1)
    expect(groups[0]?.slice().sort()).toEqual(["a", "b", "c"])
  })
})

describe("unionBBox", () => {
  it("spans every member", () => {
    expect(unionBBox([rect(0, 0, 200, 100), rect(0, 100, 240, 100)])).toEqual({
      x: 0,
      y: 0,
      width: 240,
      height: 200,
    })
  })
})

describe("reflowStack", () => {
  it("re-flows a vertical stack so panels stay flush when one widens", () => {
    const base = {
      a: rect(0, 0, 200, 100),
      b: rect(0, 100, 200, 120),
    }
    const out = reflowStack(base, ["a", "b"], "a", rect(0, 0, 260, 140))
    expect(out).toEqual({
      a: rect(0, 0, 260, 140),
      // b inherits the new width and slides down to sit flush under a.
      b: rect(0, 140, 260, 120),
    })
  })

  it("re-flows a horizontal row so panels stay flush when one grows", () => {
    const base = {
      a: rect(0, 0, 200, 100),
      b: rect(200, 0, 160, 100),
    }
    const out = reflowStack(base, ["a", "b"], "a", rect(0, 0, 240, 130))
    expect(out).toEqual({
      a: rect(0, 0, 240, 130),
      b: rect(240, 0, 160, 130),
    })
  })

  it("returns null for a single panel", () => {
    expect(
      reflowStack(
        { a: rect(0, 0, 200, 100) },
        ["a"],
        "a",
        rect(0, 0, 200, 100),
      ),
    ).toBeNull()
  })
})

describe("snapToNeighbors", () => {
  it("clicks a near panel flush below a neighbour and matches its width", () => {
    const snapped = snapToNeighbors(rect(6, 104, 180, 100), [
      rect(0, 0, 200, 100),
    ])
    expect(snapped).toEqual({ x: 0, y: 100, width: 200, height: 100 })
  })

  it("does not dock side-by-side (horizontal docking disabled)", () => {
    const original = rect(203, 4, 160, 90)
    expect(snapToNeighbors(original, [rect(0, 0, 200, 100)])).toEqual(original)
  })

  it("leaves a far panel untouched", () => {
    const original = rect(400, 400, 160, 90)
    expect(snapToNeighbors(original, [rect(0, 0, 200, 100)])).toEqual(original)
  })
})
