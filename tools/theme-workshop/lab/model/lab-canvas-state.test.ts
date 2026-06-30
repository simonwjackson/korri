import { describe, expect, it } from "bun:test"
import {
  bindObjectInstance,
  bindObjectStateGroup,
  clampScale,
  createObjectInstance,
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
