import { describe, expect, it } from "bun:test"
import {
  axisEnabled,
  axisOptionsFromTags,
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabScreenActive,
  type LabStateAxis,
  liveActiveMap,
  pinAxisActive,
  pinFromTable,
  releaseAxisActive,
  restorePinsActive,
} from "./lab-state-axis"

const singleAxis = (id: string): LabStateAxis => ({
  id,
  kind: "single",
  label: id,
  liveLabel: "Auto",
  states: [],
  pin: () => {},
  release: () => {},
})

const multiAxis = (id: string): LabStateAxis => ({
  id,
  kind: "multi",
  label: id,
  liveLabel: "Auto",
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
  it("treats an unset value or the live sentinel as live for a single axis", () => {
    expect(isAxisLive(undefined)).toBe(true)
    expect(isAxisLive({ kind: "single", value: LAB_AXIS_LIVE })).toBe(true)
    expect(isAxisLive({ kind: "single", value: "Ready" })).toBe(false)
  })

  it("treats an empty multi set as live", () => {
    expect(isAxisLive({ kind: "multi", on: new Set() })).toBe(true)
    expect(isAxisLive({ kind: "multi", on: new Set(["Toast"]) })).toBe(false)
  })
})

describe("axisEnabled", () => {
  const launch: LabStateAxis = {
    id: "launch",
    kind: "single",
    label: "Launch",
    liveLabel: "Auto",
    states: [],
    pin: () => {},
    release: () => {},
    parent: { axisId: "data", whenStates: ["Ready"] },
  }

  it("honors structural parents against the active map", () => {
    expect(
      axisEnabled(launch, { data: { kind: "single", value: "Ready" } }),
    ).toBe(true)
    expect(
      axisEnabled(launch, { data: { kind: "single", value: "Empty" } }),
    ).toBe(false)
  })

  it("is always enabled when no parent is declared", () => {
    expect(axisEnabled(singleAxis("data"), {})).toBe(true)
  })

  it("does not treat multi axes as structural parents yet", () => {
    const child: LabStateAxis = {
      ...singleAxis("child"),
      parent: { axisId: "overlays", whenStates: ["Notice"] },
    }
    expect(
      axisEnabled(child, {
        overlays: { kind: "multi", on: new Set(["Notice", "Toast"]) },
      }),
    ).toBe(false)
  })
})

describe("pinFromTable", () => {
  const table = { Ready: () => "ready-sample", Empty: () => "empty-sample" }

  it("applies the looked-up sample for a known id", () => {
    const applied: string[] = []
    pinFromTable(table, value => applied.push(value))("Empty")
    expect(applied).toEqual(["empty-sample"])
  })

  it("is a safe no-op for an unknown id (no cast, no crash)", () => {
    const applied: string[] = []
    pinFromTable(table, value => applied.push(value))("Nope")
    expect(applied).toEqual([])
  })
})

describe("active map helpers", () => {
  it("starts every axis Live", () => {
    expect(liveActiveMap([singleAxis("data"), multiAxis("overlays")])).toEqual({
      data: { kind: "single", value: LAB_AXIS_LIVE },
      overlays: { kind: "multi", on: new Set() },
    })
  })

  it("pins one single axis and leaves the others untouched", () => {
    const data = singleAxis("data")
    const launch = singleAxis("launch")
    const start = liveActiveMap([data, launch])
    const next = pinAxisActive(start, data, "Empty")
    expect(next).toEqual({
      data: { kind: "single", value: "Empty" },
      launch: { kind: "single", value: LAB_AXIS_LIVE },
    })
    expect(start.data).toEqual({ kind: "single", value: LAB_AXIS_LIVE })
  })

  it("adds and removes individual states for a multi axis", () => {
    const overlays = multiAxis("overlays")
    const start = liveActiveMap([overlays])
    const withNotice = pinAxisActive(start, overlays, "Notice")
    const withBoth = pinAxisActive(withNotice, overlays, "Toast")
    expect(withBoth.overlays).toEqual({
      kind: "multi",
      on: new Set(["Notice", "Toast"]),
    })

    const withoutNotice = releaseAxisActive(withBoth, overlays, "Notice")
    expect(withoutNotice.overlays).toEqual({
      kind: "multi",
      on: new Set(["Toast"]),
    })
    expect(
      isAxisLive(releaseAxisActive(withoutNotice, overlays).overlays),
    ).toBe(true)
  })

  it("releases one single axis back to Live", () => {
    const launch = singleAxis("launch")
    const pinned: LabScreenActive = {
      data: { kind: "single", value: "Empty" },
      launch: { kind: "single", value: "Launching" },
    }
    expect(releaseAxisActive(pinned, launch)).toEqual({
      data: { kind: "single", value: "Empty" },
      launch: { kind: "single", value: LAB_AXIS_LIVE },
    })
  })

  it("restores remembered single pins and multi sets on the Inspect toggle", () => {
    const axes = [singleAxis("data"), multiAxis("overlays")]
    const live = liveActiveMap(axes)
    const remembered: LabScreenActive = {
      data: { kind: "single", value: "Empty" },
      overlays: { kind: "multi", on: new Set(["Notice"]) },
    }
    expect(restorePinsActive(axes, live, remembered)).toEqual({
      data: { kind: "single", value: "Empty" },
      overlays: { kind: "multi", on: new Set(["Notice"]) },
    })
  })
})
