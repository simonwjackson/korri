import { describe, expect, it } from "bun:test"
import { LaunchablesState } from "./state"

const ready = LaunchablesState.fromQueryResult({
  _tag: "Launchables",
  items: [
    { packageName: "a", label: "A" },
    { packageName: "b", label: "B" },
    { packageName: "c", label: "C" },
  ],
})

describe("LaunchablesState", () => {
  it("converts query results into Ready or LoadError", () => {
    expect(ready._tag).toBe("Ready")
    expect(
      LaunchablesState.fromQueryResult({ _tag: "QueryFailed", message: "boom" }),
    ).toEqual({ _tag: "LoadError", message: "boom" })
  })

  it("moves selection down and up within bounds", () => {
    let state = ready
    state = LaunchablesState.moveSelection(state, "down")
    state = LaunchablesState.moveSelection(state, "down")
    state = LaunchablesState.moveSelection(state, "down")
    expect(state).toMatchObject({ selectedIndex: 2 })
    state = LaunchablesState.moveSelection(state, "up")
    expect(state).toMatchObject({ selectedIndex: 1 })
  })

  it("ignores horizontal movement and non-ready states", () => {
    expect(LaunchablesState.moveSelection(ready, "left")).toBe(ready)
    const loading = LaunchablesState.loading()
    expect(LaunchablesState.moveSelection(loading, "down")).toBe(loading)
  })

  it("selects the highlighted launchable", () => {
    expect(LaunchablesState.selected(ready)).toEqual({
      _tag: "Some",
      value: { packageName: "a", label: "A" },
    })
    expect(LaunchablesState.selected(LaunchablesState.loading())).toEqual({
      _tag: "None",
    })
  })

  it("surfaces launch failures as a notice and clears it on movement", () => {
    const failed = LaunchablesState.withLaunchResult(ready, {
      _tag: "LaunchFailed",
      reason: "NotFound",
      message: "gone",
    })
    expect(failed).toMatchObject({ notice: "NotFound: gone" })
    expect(
      LaunchablesState.moveSelection(failed, "down"),
    ).toMatchObject({ notice: null })
    expect(
      LaunchablesState.withLaunchResult(failed, { _tag: "Launched" }),
    ).toMatchObject({ notice: null })
  })
})
