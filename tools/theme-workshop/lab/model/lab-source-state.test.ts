import { describe, expect, it } from "bun:test"
import { DEFAULT_SOURCE_ID, initialValuesForBinding, isLabInputValue, sourcesForAdapter } from "./lab-source-state"
import type { LabSurfaceAdapter } from "../surface-registry"

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  makeSeedInitialValues: async () => ({ source: "default" }),
  mountSurface: () => ({ router: {}, dispose: () => undefined }),
}

describe("lab source/state model", () => {
  it("defaults to a single fixture-only local source", async () => {
    expect(sourcesForAdapter(adapter)).toEqual([{ id: DEFAULT_SOURCE_ID, label: "test fixture", description: "Default local fixture data." }])
    await expect(initialValuesForBinding(adapter, { sourceId: "default", stateId: "ready" })).resolves.toEqual({ source: "default" })
  })

  it("uses adapter-provided fixture binding when present", async () => {
    const custom: LabSurfaceAdapter = {
      ...adapter,
      sources: [{ id: "sparse", label: "Sparse" }],
      makeSeedInitialValuesForBinding: async binding => binding,
    }

    expect(sourcesForAdapter(custom).map(source => source.id)).toEqual(["sparse"])
    await expect(initialValuesForBinding(custom, { sourceId: "sparse", stateId: "Empty" })).resolves.toEqual({ sourceId: "sparse", stateId: "Empty" })
  })

  it("treats any non-empty tag as a valid dynamic state", () => {
    expect(isLabInputValue("Ready")).toBe(true)
    expect(isLabInputValue("LoadError")).toBe(true)
    expect(isLabInputValue("")).toBe(false)
  })
})
