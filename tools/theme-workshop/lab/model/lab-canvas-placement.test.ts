import { describe, expect, it } from "bun:test"
import {
  DEFAULT_PLACEMENT_PATTERN,
  isPlacementPattern,
  LAB_PLACEMENT_PATTERNS,
  placementAnchor,
  placeNext,
  type Rect,
  rectsOverlap,
  repackPositions,
} from "./lab-canvas-placement"

const size = { w: 100, h: 100 }

function overlapsAny(
  point: { x: number; y: number },
  occupied: readonly Rect[],
): boolean {
  const rect = { ...point, ...size }
  return occupied.some(other => rectsOverlap(rect, other))
}

describe("placement pattern enum", () => {
  it("exposes spiral and grid with spiral as the default", () => {
    expect([...LAB_PLACEMENT_PATTERNS]).toEqual(["spiral", "grid"])
    expect(DEFAULT_PLACEMENT_PATTERN).toBe("spiral")
  })

  it("guards arbitrary strings and rejects the removed cascade pattern", () => {
    expect(isPlacementPattern("spiral")).toBe(true)
    expect(isPlacementPattern("grid")).toBe(true)
    expect(isPlacementPattern("cascade")).toBe(false)
    expect(isPlacementPattern("nope")).toBe(false)
  })
})

describe("rectsOverlap", () => {
  it("detects overlap and separation with a gap", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    expect(rectsOverlap(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true)
    expect(rectsOverlap(a, { x: 140, y: 0, w: 100, h: 100 }, 20)).toBe(false)
    expect(rectsOverlap(a, { x: 110, y: 0, w: 100, h: 100 }, 20)).toBe(true)
  })
})

describe("placementAnchor", () => {
  it("uses the viewport centre for an empty board", () => {
    expect(placementAnchor("spiral", [], { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
    })
    expect(placementAnchor("grid", [], { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
    })
  })

  it("rings spiral placement around the cluster centroid, not the moving viewport", () => {
    const occupied: Rect[] = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 200, y: 0, w: 100, h: 100 },
    ]
    // Centroid of the two card centres: ((50+250)/2, (50+50)/2) = (150, 50).
    expect(placementAnchor("spiral", occupied, { x: 9999, y: 9999 })).toEqual({
      x: 150,
      y: 50,
    })
  })

  it("anchors grid placement on the cluster's top-left, not the moving viewport", () => {
    const occupied: Rect[] = [
      { x: 200, y: 80, w: 100, h: 100 },
      { x: 40, y: 300, w: 100, h: 100 },
    ]
    // Top-left-most corner across the cluster: (min x, min y) = (40, 80).
    expect(placementAnchor("grid", occupied, { x: 9999, y: 9999 })).toEqual({
      x: 40,
      y: 80,
    })
  })

  it("keeps grid rows aligned as the camera follows each placement", () => {
    // Card placed first becomes the lattice origin; the next free slot is to its
    // right on the SAME row (no diagonal drift).
    const origin = { x: 0, y: 0 }
    const first: Rect = { x: 0, y: 0, w: 100, h: 100 }
    const anchor = placementAnchor("grid", [first], origin)
    const second = placeNext("grid", [first], anchor, size)
    expect(second.y).toBe(first.y)
    expect(second.x).toBeGreaterThan(first.x)
  })
})

describe("placeNext", () => {
  it("spiral centers the first card and rings outward without overlap", () => {
    const first = placeNext("spiral", [], { x: 0, y: 0 }, size)
    expect(first).toEqual({ x: -50, y: -50 })

    const occupied: Rect[] = [{ ...first, ...size }]
    const second = placeNext("spiral", occupied, { x: 0, y: 0 }, size)
    expect(overlapsAny(second, occupied)).toBe(false)
    expect(second).not.toEqual(first)
  })

  it("grid fills the first free row-major slot from the anchor origin", () => {
    const origin = { x: 24, y: 24 }
    const first = placeNext("grid", [], origin, size)
    expect(first).toEqual({ x: 24, y: 24 })

    const occupied: Rect[] = [{ ...first, ...size }]
    const second = placeNext("grid", occupied, origin, size)
    expect(overlapsAny(second, occupied)).toBe(false)
  })

  it("spiral fills a compact, non-overlapping cluster around a fixed anchor", () => {
    const placed: Rect[] = []
    for (let i = 0; i < 6; i += 1) {
      const point = placeNext("spiral", placed, { x: 0, y: 0 }, size)
      expect(overlapsAny(point, placed)).toBe(false)
      placed.push({ ...point, ...size })
    }
  })
})

describe("repackPositions", () => {
  it("grid repacks row-major across three columns with gap-inclusive stride", () => {
    const big = { w: 540, h: 480 }
    const gap = 32
    const positions = repackPositions("grid", 4, { x: 24, y: 24 }, big)
    expect(positions[0]).toEqual({ x: 24, y: 24 })
    expect(positions[1]).toEqual({ x: 24 + big.w + gap, y: 24 })
    expect(positions[3]).toEqual({ x: 24, y: 24 + big.h + gap })
  })

  it("spiral repack starts centered on the anchor and never overlaps", () => {
    const positions = repackPositions("spiral", 5, { x: 0, y: 0 }, size)
    expect(positions[0]).toEqual({ x: -50, y: -50 })
    for (const [i, a] of positions.entries()) {
      for (const b of positions.slice(i + 1)) {
        expect(rectsOverlap({ ...a, ...size }, { ...b, ...size })).toBe(false)
      }
    }
  })
})
