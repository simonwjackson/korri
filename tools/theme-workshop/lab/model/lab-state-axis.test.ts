import { describe, expect, it } from "bun:test"
import {
  axisEnabled,
  axisOptionsFromTags,
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabStateAxis,
} from "./lab-state-axis"

describe("axisOptionsFromTags", () => {
  it("derives one option per machine tag with humanized labels", () => {
    expect(
      axisOptionsFromTags(["Loading", "Ready", "LoadError"]),
    ).toEqual([
      { id: "Loading", label: "Loading" },
      { id: "Ready", label: "Ready" },
      { id: "LoadError", label: "Load error" },
    ])
  })

  it("accepts a custom label function", () => {
    expect(axisOptionsFromTags(["Ready"], tag => `${tag}!`)).toEqual([
      { id: "Ready", label: "Ready!" },
    ])
  })
})

describe("isAxisLive", () => {
  it("treats an unset value or the live sentinel as live", () => {
    expect(isAxisLive(undefined)).toBe(true)
    expect(isAxisLive(LAB_AXIS_LIVE)).toBe(true)
    expect(isAxisLive("Ready")).toBe(false)
  })
})

describe("axisEnabled", () => {
  const launch: LabStateAxis = {
    id: "launch",
    label: "Launch",
    liveLabel: "Live",
    states: [],
    pin: () => {},
    release: () => {},
    enabledWhen: active => active.data === "Ready",
  }

  it("honors enabledWhen against the active map", () => {
    expect(axisEnabled(launch, { data: "Ready" })).toBe(true)
    expect(axisEnabled(launch, { data: "Empty" })).toBe(false)
  })

  it("is always enabled when no enabledWhen is declared", () => {
    const data: LabStateAxis = {
      id: "data",
      label: "Data",
      liveLabel: "Live",
      states: [],
      pin: () => {},
      release: () => {},
    }
    expect(axisEnabled(data, {})).toBe(true)
  })
})
