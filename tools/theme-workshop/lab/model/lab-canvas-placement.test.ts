import { describe, expect, it } from "bun:test"
import {
  DEFAULT_PLACEMENT_PATTERN,
  isPlacementPattern,
  LAB_PLACEMENT_PATTERNS,
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
  it("exposes the three selectable patterns with cascade as default", () => {
    expect([...LAB_PLACEMENT_PATTERNS]).toEqual(["cascade", "spiral", "grid"])
    expect(DEFAULT_PLACEMENT_PATTERN).toBe("cascade")
  })

  it("guards arbitrary strings", () => {
    expect(isPlacementPattern("spiral")).toBe(true)
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

describe("placeNext", () => {
  it("cascade centers the card on the anchor when space is free", () => {
    expect(placeNext("cascade", [], { x: 0, y: 0 }, size)).toEqual({
      x: -50,
      y: -50,
    })
  })

  it("cascade steps diagonally into free space when the anchor slot is taken", () => {
    const occupied: Rect[] = [{ x: -50, y: -50, ...size }]
    const next = placeNext("cascade", occupied, { x: 0, y: 0 }, size)

    expect(next.x).toBeGreaterThan(-50)
    expect(next.y).toBeGreaterThan(-50)
    expect(overlapsAny(next, occupied)).toBe(false)
  })

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
})

describe("repackPositions", () => {
  it("grid repacks row-major across three columns with gap-inclusive stride", () => {
    const size = { w: 540, h: 480 }
    const gap = 32
    const positions = repackPositions("grid", 4, { x: 24, y: 24 }, size)
    expect(positions[0]).toEqual({ x: 24, y: 24 })
    expect(positions[1]).toEqual({ x: 24 + size.w + gap, y: 24 })
    expect(positions[3]).toEqual({ x: 24, y: 24 + size.h + gap })
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

  it("cascade repack offsets each card diagonally without overlapping", () => {
    const positions = repackPositions("cascade", 3, { x: 0, y: 0 }, size)
    const [first, second] = positions
    expect(first).toEqual({ x: -50, y: -50 })
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0)
    expect(second?.y ?? 0).toBeGreaterThan(first?.y ?? 0)
    for (const [i, a] of positions.entries()) {
      for (const b of positions.slice(i + 1)) {
        expect(rectsOverlap({ ...a, ...size }, { ...b, ...size })).toBe(false)
      }
    }
  })

  it("cascade repack keeps full-size cards from overlapping", () => {
    const big = { w: 540, h: 480 }
    const positions = repackPositions("cascade", 3, { x: 0, y: 0 }, big)
    for (const [i, a] of positions.entries()) {
      for (const b of positions.slice(i + 1)) {
        expect(rectsOverlap({ ...a, ...big }, { ...b, ...big })).toBe(false)
      }
    }
  })
})
