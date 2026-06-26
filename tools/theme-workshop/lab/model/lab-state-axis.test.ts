import { describe, expect, it } from "bun:test"
import {
  axisEnabled,
  axisOptionsFromTags,
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabStateAxis,
  liveActiveMap,
  pinAxisActive,
  releaseAxisActive,
} from "./lab-state-axis"

const axis = (id: string): LabStateAxis => ({
  id,
  label: id,
  liveLabel: "Live",
  states: [],
  pin: () => {},
  release: () => {},
})

describe("axisOptionsFromTags", () => {
  it("derives one option per machine tag with humanized labels", () => {
    expect(axisOptionsFromTags(["Loading", "Ready", "LoadError"])).toEqual([
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
    expect(axisEnabled(axis("data"), {})).toBe(true)
  })
})

describe("active map helpers", () => {
  it("starts every axis Live", () => {
    expect(liveActiveMap([axis("data"), axis("launch")])).toEqual({
      data: LAB_AXIS_LIVE,
      launch: LAB_AXIS_LIVE,
    })
  })

  it("pins one axis and leaves the others untouched", () => {
    const start = liveActiveMap([axis("data"), axis("launch")])
    const next = pinAxisActive(start, "data", "Empty")
    expect(next).toEqual({ data: "Empty", launch: LAB_AXIS_LIVE })
    expect(start.data).toBe(LAB_AXIS_LIVE)
  })

  it("releases one axis back to Live", () => {
    const pinned = { data: "Empty", launch: "Launching" }
    expect(releaseAxisActive(pinned, "launch")).toEqual({
      data: "Empty",
      launch: LAB_AXIS_LIVE,
    })
  })
})
