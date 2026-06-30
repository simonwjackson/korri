import { describe, expect, it } from "bun:test"
import {
  type DockRect,
  dockedSide,
  dockedX,
  layoutWell,
  maxResizeHeight,
  reanchorOnResize,
  WELL_GAP,
  WELL_PAD,
} from "./lab-panel-dock"

const INNER_W = 1440
const BAR_H = 48

describe("dockedSide", () => {
  it("detects left and right docking at a given viewport width", () => {
    expect(dockedSide({ x: WELL_PAD, y: 60, width: 248 }, INNER_W)).toBe("left")
    expect(
      dockedSide({ x: INNER_W - WELL_PAD - 248, y: 60, width: 248 }, INNER_W),
    ).toBe("right")
  })

  it("reports null for a floating panel and for a full-width panel", () => {
    expect(dockedSide({ x: 400, y: 200, width: 248 }, INNER_W)).toBeNull()
    expect(dockedSide({ x: 0, y: 0, width: INNER_W }, INNER_W)).toBeNull()
  })

  it("no longer recognizes a right dock once the viewport width changes", () => {
    // The exact bug: a right-docked rect from a 1440 viewport is not docked at 1600.
    const rect: DockRect = { x: INNER_W - WELL_PAD - 248, y: 60, width: 248 }
    expect(dockedSide(rect, INNER_W)).toBe("right")
    expect(dockedSide(rect, 1600)).toBeNull()
  })
})

describe("maxResizeHeight", () => {
  it("lets a panel grow up to its natural content height", () => {
    // Content taller than the current box (scrollbar showing) -> can grow to it.
    expect(maxResizeHeight(840, 2000, 140)).toBe(840)
  })

  it("never exceeds the natural content height once content fits", () => {
    // Asking for more than content is capped at content (no scrollbar -> no taller).
    expect(maxResizeHeight(300, 2000, 140)).toBe(300)
  })

  it("is bounded by the available viewport space", () => {
    expect(maxResizeHeight(2000, 600, 140)).toBe(600)
  })

  it("never drops below the minimum height", () => {
    expect(maxResizeHeight(80, 2000, 140)).toBe(140)
  })
})

describe("dockedX", () => {
  it("anchors to the correct edge for the viewport", () => {
    expect(dockedX("left", 248, INNER_W)).toBe(WELL_PAD)
    expect(dockedX("right", 248, INNER_W)).toBe(INNER_W - WELL_PAD - 248)
  })
})

describe("layoutWell", () => {
  it("stacks panels top-aligned and spaces them by content height, leaving height auto", () => {
    const pos: Record<string, DockRect> = {
      a: { x: 0, y: 0, width: 248, height: 999 },
      b: { x: 0, y: 0, width: 248, height: 999 },
    }
    const content: Record<string, number> = { a: 120, b: 200 }
    const out = layoutWell(
      pos,
      ["a", "b"],
      "right",
      INNER_W,
      BAR_H,
      id => content[id] ?? 0,
    )

    // No explicit height -> the panel sizes to content (never taller than it).
    expect(out.a).toEqual({
      x: INNER_W - WELL_PAD - 248,
      y: BAR_H + WELL_PAD,
      width: 248,
    })
    expect(out.a?.height).toBeUndefined()
    // The second panel is spaced below the first by its content height + gap.
    expect(out.b).toEqual({
      x: INNER_W - WELL_PAD - 248,
      y: BAR_H + WELL_PAD + 120 + WELL_GAP,
      width: 248,
    })
  })
})

describe("reanchorOnResize", () => {
  it("keeps a right-docked panel docked after the window widens", () => {
    const pos: Record<string, DockRect> = {
      inspector: {
        x: INNER_W - WELL_PAD - 248,
        y: 60,
        width: 248,
        height: 180,
      },
    }
    const content = () => 180

    const next = reanchorOnResize(
      pos,
      ["inspector"],
      INNER_W,
      1600,
      BAR_H,
      content,
    )

    // Re-anchored to the NEW edge so it still reads as docked at 1600.
    const inspector = next.inspector
    expect(inspector).toBeDefined()
    if (!inspector) throw new Error("expected inspector rect")
    expect(dockedSide(inspector, 1600)).toBe("right")
    expect(inspector.x).toBe(1600 - WELL_PAD - 248)
    expect(inspector.height).toBeUndefined()
  })

  it("re-stacks a side well at content height and leaves floating panels untouched", () => {
    const pos: Record<string, DockRect> = {
      a: { x: WELL_PAD, y: 60, width: 248, height: 999 },
      b: { x: WELL_PAD, y: 400, width: 248, height: 999 },
      floating: { x: 500, y: 300, width: 248, height: 220 },
    }
    const content: Record<string, number> = { a: 100, b: 140, floating: 220 }

    const next = reanchorOnResize(
      pos,
      ["a", "b", "floating"],
      INNER_W,
      1200,
      BAR_H,
      id => content[id] ?? 0,
    )

    expect(next.a).toEqual({ x: WELL_PAD, y: BAR_H + WELL_PAD, width: 248 })
    expect(next.b).toEqual({
      x: WELL_PAD,
      y: BAR_H + WELL_PAD + 100 + WELL_GAP,
      width: 248,
    })
    // The floating panel is not in a well, so it is returned unchanged.
    expect(next.floating).toEqual(pos.floating)
  })
})
