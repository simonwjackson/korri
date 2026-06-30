import { describe, expect, it } from "bun:test"
import {
  bindObjectInstance,
  bindObjectStateGroup,
  cameraSettled,
  clampScale,
  createObjectInstance,
  frameCameraOn,
  isRectFullyVisible,
  lerpCamera,
  reconcileInstancesWithSelection,
  resetObjectIdCounterForTest,
} from "./lab-canvas-state"

describe("lab canvas state", () => {
  it("creates stable object instances for selected stories without duplicating existing objects", () => {
    resetObjectIdCounterForTest()
    const first = createObjectInstance("story-a", "default", {
      variant: "Ready",
    })

    const reconciled = reconcileInstancesWithSelection(
      [first],
      ["story-a", "story-b"],
      {
        sourceId: "default",
        stateGroupValuesForStory: storyId => {
          if (storyId === "story-b")
            return { variant: "Ready", foreground: "Ready" }
          const empty: Readonly<Record<string, string>> = {}
          return empty
        },
      },
    )

    expect(reconciled).toHaveLength(2)
    expect(reconciled[0]).toEqual(first)
    expect(reconciled[1]).toMatchObject({
      storyId: "story-b",
      sourceId: "default",
      stateGroupValues: { variant: "Ready", foreground: "Ready" },
    })
  })

  it("removes object instances whose stories are no longer selected", () => {
    resetObjectIdCounterForTest()
    const first = createObjectInstance("story-a", "default", {
      variant: "Ready",
    })
    const second = createObjectInstance("story-b", "default", {
      variant: "Ready",
    })

    const reconciled = reconcileInstancesWithSelection(
      [first, second],
      ["story-b"],
      { sourceId: "default", stateGroupValuesForStory: () => ({}) },
    )

    expect(reconciled).toEqual([second])
  })

  it("binds source, state groups, and camera position without resetting siblings", () => {
    resetObjectIdCounterForTest()
    const first = createObjectInstance("story-a", "default", {
      variant: "Ready",
      foreground: "Ready",
    })
    const [moved] = bindObjectInstance([first], first.id, {
      sourceId: "sparse",
      x: 10,
      y: 20,
    })
    expect(moved).toBeDefined()
    if (!moved) throw new Error("Expected moved object")
    const [bound] = bindObjectStateGroup([moved], first.id, "variant", "Empty")

    expect(bound).toMatchObject({
      sourceId: "sparse",
      stateGroupValues: { variant: "Empty", foreground: "Ready" },
      x: 10,
      y: 20,
    })
    expect(clampScale(0.01)).toBe(0.25)
    expect(clampScale(99)).toBe(2.5)
    expect(clampScale(1.5)).toBe(1.5)
  })

  it("creates stateless object instances with an empty state group map", () => {
    resetObjectIdCounterForTest()
    expect(createObjectInstance("pill", "default", {})).toMatchObject({
      storyId: "pill",
      sourceId: "default",
      stateGroupValues: {},
    })
  })
})

describe("camera framing", () => {
  it("centers a rect in the viewport at the current scale", () => {
    expect(
      frameCameraOn(
        { x: 0, y: 0, scale: 1 },
        { x: 100, y: 50, w: 200, h: 100 },
        { w: 1000, h: 600 },
      ),
    ).toEqual({ x: 300, y: 200, scale: 1 })
  })

  it("accounts for camera scale when framing", () => {
    expect(
      frameCameraOn(
        { x: 0, y: 0, scale: 2 },
        { x: 0, y: 0, w: 100, h: 100 },
        { w: 1000, h: 600 },
      ),
    ).toEqual({ x: 400, y: 200, scale: 2 })
  })

  it("lerps between two cameras and clamps t", () => {
    const from = { x: 0, y: 0, scale: 1 }
    const to = { x: 100, y: 100, scale: 2 }
    expect(lerpCamera(from, to, 0.5)).toEqual({ x: 50, y: 50, scale: 1.5 })
    expect(lerpCamera(from, to, 2)).toEqual(to)
    expect(lerpCamera(from, to, -1)).toEqual(from)
  })

  it("settles when within epsilon on every axis", () => {
    const target = { x: 100, y: 100, scale: 1 }
    expect(cameraSettled({ x: 100.2, y: 99.8, scale: 1 }, target)).toBe(true)
    expect(cameraSettled({ x: 120, y: 100, scale: 1 }, target)).toBe(false)
  })

  it("reports whether a world rect is fully on screen", () => {
    const camera = { x: 0, y: 0, scale: 1 }
    const viewport = { w: 1000, h: 600 }
    expect(
      isRectFullyVisible(camera, { x: 100, y: 100, w: 200, h: 200 }, viewport),
    ).toBe(true)
    // Off the right edge.
    expect(
      isRectFullyVisible(camera, { x: 900, y: 100, w: 200, h: 200 }, viewport),
    ).toBe(false)
    // Fully visible but fails once a margin is required.
    expect(
      isRectFullyVisible(camera, { x: 10, y: 10, w: 50, h: 50 }, viewport, 40),
    ).toBe(false)
  })
})
