import { describe, expect, it } from "bun:test"
import { LaunchState } from "@platform/library/launch-state"
import { humanizeTag, stateVariants } from "./state-variants"

describe("stateVariants", () => {
  it("produces one labeled variant per tag, in tag order", () => {
    const variants = stateVariants(
      { tags: ["Red", "Yellow", "GoFast"] },
      {
        Red: () => "stop",
        Yellow: () => "slow",
        GoFast: () => "go",
      },
    )

    expect(variants.map(v => v.tag)).toEqual(["Red", "Yellow", "GoFast"])
    expect(variants.map(v => v.value)).toEqual(["stop", "slow", "go"])
    expect(variants.map(v => v.label)).toEqual(["Red", "Yellow", "Go fast"])
  })

  it("derives every state from a real domain machine, exhaustively", () => {
    // Omitting any LaunchState tag here is a COMPILE error — that is the point.
    const variants = stateVariants(LaunchState, {
      Idle: () => "idle",
      ReleaseSelectionRequired: () => "pick a version",
      Unavailable: () => "not here",
      Launching: () => "starting",
      Launched: () => "playing",
      Failed: () => "couldn't start",
      Defect: () => "defect",
    })

    expect(variants).toHaveLength(LaunchState.tags.length)
    expect(new Set(variants.map(v => v.tag))).toEqual(new Set(LaunchState.tags))
  })

  it("honors a custom label function", () => {
    const variants = stateVariants(
      { tags: ["A"] },
      { A: () => 1 },
      { label: tag => `<${tag}>` },
    )
    expect(variants[0]?.label).toBe("<A>")
  })

  it("humanizes PascalCase tags by default", () => {
    expect(humanizeTag("LoadError")).toBe("Load error")
    expect(humanizeTag("ReleaseSelectionRequired")).toBe(
      "Release selection required",
    )
  })
})
