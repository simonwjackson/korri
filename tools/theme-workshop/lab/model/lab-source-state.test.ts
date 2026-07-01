import { describe, expect, it } from "bun:test"
import type { LabSurfaceAdapter } from "../surface-registry"
import {
  DEFAULT_SOURCE_ID,
  initialValuesForBinding,
  isLabInputValue,
  sourcesForAdapter,
} from "./lab-source-state"

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  makeSeedInitialValues: async () => ({ source: "default" }),
  mountSurface: () => ({ router: {}, dispose: () => undefined }),
}

describe("lab source/input model", () => {
  it("defaults to a single fixture-only local source", async () => {
    expect(sourcesForAdapter(adapter)).toEqual([
      {
        id: DEFAULT_SOURCE_ID,
        label: "test fixture",
        description: "Default local fixture data.",
      },
    ])
    await expect(
      initialValuesForBinding(adapter, {
        sourceId: "default",
        stateId: "ready",
      }),
    ).resolves.toEqual({ source: "default" })
  })

  it("uses adapter-provided fixture binding when present", async () => {
    const custom: LabSurfaceAdapter = {
      ...adapter,
      sources: [{ id: "sparse", label: "Sparse" }],
      makeSeedInitialValuesForBinding: async binding => binding,
    }

    expect(sourcesForAdapter(custom).map(source => source.id)).toEqual([
      "sparse",
    ])
    await expect(
      initialValuesForBinding(custom, { sourceId: "sparse", stateId: "Empty" }),
    ).resolves.toEqual({ sourceId: "sparse", stateId: "Empty" })
  })

  it("accepts primitive and structured product input values", () => {
    expect(isLabInputValue("Ready")).toBe(true)
    expect(isLabInputValue(42)).toBe(true)
    expect(isLabInputValue(false)).toBe(true)
    expect(isLabInputValue({ percent: 37, charging: false })).toBe(true)
    expect(isLabInputValue(["not", "an", "input"])).toBe(false)
  })
})
