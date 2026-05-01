import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  __resetCenterScrollState,
  centerScrollableAncestors,
  easeOutCubic,
  MARIO_CAMERA_DURATION_MS,
} from "./center-scroll"

/**
 * Tests stub `getBoundingClientRect` on each element so the centering math
 * has real coordinates to work with — happy-dom returns all-zero rects for
 * unlaid-out elements. Scroll properties are real DOM properties on
 * HTMLElement, set/read directly.
 */

interface SurfaceShape {
  /** Inline-axis: clientWidth (visible width of the scroll container). */
  readonly clientWidth: number
  /** Inline-axis: scrollWidth (full width of the scroll content). */
  readonly scrollWidth: number
  /** Block-axis: clientHeight. */
  readonly clientHeight?: number
  /** Block-axis: scrollHeight. */
  readonly scrollHeight?: number
  /** Visible bounding-rect left edge (used to compute container center). */
  readonly rectLeft: number
  /** Visible bounding-rect top edge. */
  readonly rectTop?: number
}

interface TileShape {
  /** Width of the tile in pixels. */
  readonly width: number
  /** Height of the tile in pixels. */
  readonly height?: number
  /** Tile's left edge in viewport coordinates (i.e. accounts for surface scroll). */
  readonly rectLeft: number
  /** Tile's top edge. */
  readonly rectTop?: number
}

function stubRect(element: Element, rect: Partial<DOMRect>): void {
  const full: DOMRect = {
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
    bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    toJSON: () => ({}),
  }
  ;(
    element as unknown as { getBoundingClientRect: () => DOMRect }
  ).getBoundingClientRect = () => full
}

function setSize(
  element: HTMLElement,
  props: {
    scrollWidth?: number
    clientWidth?: number
    scrollHeight?: number
    clientHeight?: number
  },
): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue
    Object.defineProperty(element, key, {
      configurable: true,
      get: () => value,
    })
  }
}

function makeSurface(
  axis: "inline" | "block" | "both",
  shape: SurfaceShape,
): HTMLElement {
  const surface = document.createElement("div")
  surface.setAttribute("data-mario-camera", axis)
  setSize(surface, {
    clientWidth: shape.clientWidth,
    scrollWidth: shape.scrollWidth,
    clientHeight: shape.clientHeight ?? 0,
    scrollHeight: shape.scrollHeight ?? 0,
  })
  stubRect(surface, {
    left: shape.rectLeft,
    top: shape.rectTop ?? 0,
    width: shape.clientWidth,
    height: shape.clientHeight ?? 0,
  })
  surface.scrollLeft = 0
  surface.scrollTop = 0
  return surface
}

function makeTile(shape: TileShape): HTMLElement {
  const tile = document.createElement("button")
  stubRect(tile, {
    left: shape.rectLeft,
    top: shape.rectTop ?? 0,
    width: shape.width,
    height: shape.height ?? 0,
  })
  return tile
}

interface FakeClock {
  schedule: (cb: FrameRequestCallback) => number
  cancel: (handle: number) => void
  now: () => number
  setNow: (t: number) => void
  flush: () => void
  pendingCount: () => number
}

function makeFakeClock(): FakeClock {
  let current = 0
  const pending = new Map<number, FrameRequestCallback>()
  let nextHandle = 1
  return {
    schedule: cb => {
      const h = nextHandle++
      pending.set(h, cb)
      return h
    },
    cancel: handle => {
      pending.delete(handle)
    },
    now: () => current,
    setNow: t => {
      current = t
    },
    flush: () => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const cb of callbacks) cb(current)
    },
    pendingCount: () => pending.size,
  }
}

describe("easeOutCubic", () => {
  it("returns 0 at t=0 and 1 at t=1", () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it("clamps inputs outside [0,1]", () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })

  it("is monotonically increasing on (0,1)", () => {
    const a = easeOutCubic(0.25)
    const b = easeOutCubic(0.5)
    const c = easeOutCubic(0.75)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it("front-loads progress (eased(0.5) > 0.5)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})

describe("centerScrollableAncestors", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    __resetCenterScrollState()
  })

  afterEach(() => {
    __resetCenterScrollState()
    document.body.innerHTML = ""
  })

  describe("synchronous snap (animate: false)", () => {
    it("centers the focused tile horizontally on an inline overflowing surface", () => {
      // Surface: 1000px wide visible, 2000px scrollable, top-left at viewport (0,0).
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      // Tile: 200px wide, currently at x=600 in the viewport (so its center is at x=700).
      // Surface center is at x=500. Delta = 700 - 500 = 200. surface.scrollLeft starts at 0.
      // Target scrollLeft = 0 + 200 = 200.
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      centerScrollableAncestors(tile, { animate: false })

      expect(surface.scrollLeft).toBe(200)
    })

    it("clamps to 0 when centering would require negative scrollLeft (first tile)", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      // Tile at x=0 with width 200 → tile center 100, surface center 500.
      // Delta = -400 → desired scrollLeft = -400 → clamped to 0.
      const tile = makeTile({ width: 200, rectLeft: 0 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      centerScrollableAncestors(tile, { animate: false })

      expect(surface.scrollLeft).toBe(0)
    })

    it("clamps to maxScrollLeft when centering would require past-end scroll (last tile)", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      // Tile near right edge: rectLeft = 1500, width 200 → tile center 1600, surface center 500.
      // Delta = 1100 → desired = 1100 → clamped to maxScrollLeft = 2000 - 1000 = 1000.
      const tile = makeTile({ width: 200, rectLeft: 1500 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      centerScrollableAncestors(tile, { animate: false })

      expect(surface.scrollLeft).toBe(1000)
    })

    it("does not throw and clamps when target is wider than the container", () => {
      const surface = makeSurface("inline", {
        clientWidth: 500,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      // Tile is 800px wide, wider than 500px container.
      const tile = makeTile({ width: 800, rectLeft: 100 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      expect(() =>
        centerScrollableAncestors(tile, { animate: false }),
      ).not.toThrow()
      // Tile center 500, surface center 250. Delta = 250. scrollLeft = 250.
      // maxScrollLeft = 1500. 250 is within [0, 1500] so no clamp; just verify it landed.
      expect(surface.scrollLeft).toBe(250)
    })

    it("updates scrollTop only on a block-axis surface", () => {
      const surface = makeSurface("block", {
        clientWidth: 1000,
        scrollWidth: 1000,
        clientHeight: 600,
        scrollHeight: 1500,
        rectLeft: 0,
        rectTop: 0,
      })
      // Tile at y=400, height 100 → tile center 450, surface center 300.
      // Delta = 150 → scrollTop = 150.
      const tile = makeTile({
        width: 100,
        height: 100,
        rectLeft: 0,
        rectTop: 400,
      })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      centerScrollableAncestors(tile, { animate: false })

      expect(surface.scrollTop).toBe(150)
      expect(surface.scrollLeft).toBe(0)
    })

    it("updates both axes on a 'both' surface", () => {
      const surface = makeSurface("both", {
        clientWidth: 1000,
        scrollWidth: 2000,
        clientHeight: 600,
        scrollHeight: 1500,
        rectLeft: 0,
        rectTop: 0,
      })
      const tile = makeTile({
        width: 200,
        height: 100,
        rectLeft: 600,
        rectTop: 400,
      })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      centerScrollableAncestors(tile, { animate: false })

      // Inline: tile center 700, surface center 500 → 200.
      expect(surface.scrollLeft).toBe(200)
      // Block: tile center 450, surface center 300 → 150.
      expect(surface.scrollTop).toBe(150)
    })

    it("centers every Mario ancestor when surfaces are nested", () => {
      // Outer block surface, inner inline surface.
      const outer = makeSurface("block", {
        clientWidth: 1200,
        scrollWidth: 1200,
        clientHeight: 800,
        scrollHeight: 2000,
        rectLeft: 0,
        rectTop: 0,
      })
      const inner = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 100,
        rectTop: 600,
      })
      const tile = makeTile({
        width: 200,
        height: 100,
        rectLeft: 700,
        rectTop: 600,
      })
      inner.appendChild(tile)
      outer.appendChild(inner)
      document.body.appendChild(outer)

      centerScrollableAncestors(tile, { animate: false })

      // Inner (inline): tile center 800, surface center 100 + 500 = 600 → delta 200 → scrollLeft 200.
      expect(inner.scrollLeft).toBe(200)
      // Outer (block): tile center y = 650, surface center y = 400 → delta 250 → scrollTop 250.
      expect(outer.scrollTop).toBe(250)
    })

    it("is a no-op when there are no Mario ancestors", () => {
      const wrapper = document.createElement("div")
      const tile = makeTile({ width: 200, rectLeft: 100 })
      wrapper.appendChild(tile)
      document.body.appendChild(wrapper)

      expect(() =>
        centerScrollableAncestors(tile, { animate: false }),
      ).not.toThrow()
    })

    it("does not change scrollLeft when ancestor declares the axis but isn't overflowing", () => {
      // R3 defense-in-depth: inline ancestor whose scrollWidth == clientWidth.
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 1000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      centerScrollableAncestors(tile, { animate: false })

      expect(surface.scrollLeft).toBe(0)
    })
  })

  describe("reduced motion", () => {
    it("snaps synchronously when prefers-reduced-motion is set, even with animate: true", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)
      const clock = makeFakeClock()

      centerScrollableAncestors(tile, {
        animate: true,
        prefersReducedMotion: () => true,
        schedule: clock.schedule,
        cancel: clock.cancel,
        now: clock.now,
      })

      // Synchronous snap, no rAF scheduled.
      expect(surface.scrollLeft).toBe(200)
      expect(clock.pendingCount()).toBe(0)
    })
  })

  describe("animated tween", () => {
    it("starts the tween at the current scroll position and lands at the target value", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)
      const clock = makeFakeClock()

      centerScrollableAncestors(tile, {
        animate: true,
        prefersReducedMotion: () => false,
        schedule: clock.schedule,
        cancel: clock.cancel,
        now: clock.now,
      })

      // Initial frame scheduled, surface scrollLeft still 0 before any tick.
      expect(surface.scrollLeft).toBe(0)
      expect(clock.pendingCount()).toBe(1)

      // Advance past the duration and flush — tween should land exactly on target.
      clock.setNow(MARIO_CAMERA_DURATION_MS + 1)
      clock.flush()

      expect(surface.scrollLeft).toBe(200)
    })

    it("produces an intermediate eased value mid-animation", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)
      const clock = makeFakeClock()

      centerScrollableAncestors(tile, {
        animate: true,
        prefersReducedMotion: () => false,
        schedule: clock.schedule,
        cancel: clock.cancel,
        now: clock.now,
        durationMs: 200,
      })

      // Halfway through (100ms of 200ms): easeOutCubic(0.5) ≈ 0.875.
      clock.setNow(100)
      clock.flush()

      // 0 + 200 * 0.875 = 175.
      expect(surface.scrollLeft).toBeCloseTo(175, 0)
      expect(surface.scrollLeft).toBeGreaterThan(100) // strictly past linear
      expect(surface.scrollLeft).toBeLessThan(200) // hasn't landed yet
    })

    it("cancels and restarts from the current position on a second call", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)
      const clock = makeFakeClock()

      centerScrollableAncestors(tile, {
        animate: true,
        prefersReducedMotion: () => false,
        schedule: clock.schedule,
        cancel: clock.cancel,
        now: clock.now,
        durationMs: 200,
      })

      clock.setNow(100)
      clock.flush()

      const midway = surface.scrollLeft
      expect(midway).toBeGreaterThan(0)
      expect(midway).toBeLessThan(200)

      // Move the tile to a new position — second call should target a new value
      // and start its tween from `midway`, not from 0.
      stubRect(tile, { left: 1500, top: 0, width: 200, height: 0 })
      // New tile center 1600, surface center 500, delta = 1100.
      // surface.scrollLeft is currently `midway`. Desired = midway + 1100. Clamped to 1000.

      centerScrollableAncestors(tile, {
        animate: true,
        prefersReducedMotion: () => false,
        schedule: clock.schedule,
        cancel: clock.cancel,
        now: clock.now,
        durationMs: 200,
      })

      // No additional sync change yet — animation will tick.
      expect(surface.scrollLeft).toBe(midway)

      // Advance to completion of the second tween.
      clock.setNow(100 + 200 + 1)
      clock.flush()

      expect(surface.scrollLeft).toBe(1000)
    })
  })

  describe("interaction guards", () => {
    it("does NOT change scrollLeft when called outside the engine path (regression guard for pointer hover)", () => {
      // The pointer adapter calls `.focus({preventScroll:true})` directly,
      // bypassing the engine and bypassing this util. This test asserts that
      // the util only runs when explicitly invoked — there is no implicit
      // hook that would cause hover-focus to centre the rail (which would
      // create a feedback loop with content moving under the cursor).
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      // Simulate a programmatic focus (as the pointer adapter does).
      tile.focus({ preventScroll: true })

      // Util was not called, so scrollLeft must still be 0.
      expect(surface.scrollLeft).toBe(0)
    })

    it("DOES change scrollLeft when explicitly invoked (proves the engine→util seam shape)", () => {
      const surface = makeSurface("inline", {
        clientWidth: 1000,
        scrollWidth: 2000,
        rectLeft: 0,
      })
      const tile = makeTile({ width: 200, rectLeft: 600 })
      surface.appendChild(tile)
      document.body.appendChild(surface)

      // Engine would call the util after focusing.
      tile.focus({ preventScroll: true })
      centerScrollableAncestors(tile, { animate: false })

      expect(surface.scrollLeft).toBe(200)
    })
  })
})
