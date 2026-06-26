import { describe, expect, it } from "bun:test"
import {
  bindObjectInstance,
  clampScale,
  createObjectInstance,
  reconcileInstancesWithSelection,
  resetObjectIdCounterForTest,
} from "./lab-canvas-state"

describe("lab canvas state", () => {
  it("creates stable object instances for selected stories without duplicating existing objects", () => {
    resetObjectIdCounterForTest()
    const first = createObjectInstance("story-a", "default", "ready")

    const reconciled = reconcileInstancesWithSelection(
      [first],
      ["story-a", "story-b"],
      { sourceId: "default", stateId: "ready" },
    )

    expect(reconciled).toHaveLength(2)
    expect(reconciled[0]).toEqual(first)
    expect(reconciled[1]).toMatchObject({ storyId: "story-b", sourceId: "default", stateId: "ready" })
  })

  it("removes object instances whose stories are no longer selected", () => {
    resetObjectIdCounterForTest()
    const first = createObjectInstance("story-a", "default", "ready")
    const second = createObjectInstance("story-b", "default", "ready")

    const reconciled = reconcileInstancesWithSelection(
      [first, second],
      ["story-b"],
      { sourceId: "default", stateId: "ready" },
    )

    expect(reconciled).toEqual([second])
  })

  it("binds source/state and clamps camera scale", () => {
    resetObjectIdCounterForTest()
    const first = createObjectInstance("story-a", "default", "ready")
    const [bound] = bindObjectInstance([first], first.id, { sourceId: "sparse", stateId: "empty" })

    expect(bound).toMatchObject({ sourceId: "sparse", stateId: "empty" })
    expect(clampScale(0.01)).toBe(0.25)
    expect(clampScale(99)).toBe(2.5)
    expect(clampScale(1.5)).toBe(1.5)
  })
})
