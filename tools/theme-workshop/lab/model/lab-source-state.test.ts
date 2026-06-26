import { describe, expect, it } from "bun:test"
import { DEFAULT_SOURCE_ID, DEFAULT_STATES, initialValuesForBinding, isSourceStatus, sourcesForAdapter, statesForAdapter } from "./lab-source-state"
import type { LabSurfaceAdapter } from "../surface-registry"

const adapter: LabSurfaceAdapter = {
  id: "test",
  devices: [],
  makeSeedInitialValues: async () => ({ source: "default" }),
  mountSurface: () => ({ router: {}, dispose: () => undefined }),
}

describe("lab source/state model", () => {
  it("defaults to fixture-only local source and common loader states", async () => {
    expect(sourcesForAdapter(adapter)).toEqual([{ id: DEFAULT_SOURCE_ID, label: "test fixture", description: "Default local fixture data." }])
    expect(statesForAdapter(adapter)).toEqual(DEFAULT_STATES)
    await expect(initialValuesForBinding(adapter, { sourceId: "default", stateId: "ready" })).resolves.toEqual({ source: "default" })
  })

  it("uses adapter-provided fixture binding when present", async () => {
    const custom: LabSurfaceAdapter = {
      ...adapter,
      sources: [{ id: "sparse", label: "Sparse" }],
      states: [{ id: "empty", label: "Empty" }],
      makeSeedInitialValuesForBinding: async binding => binding,
    }

    expect(sourcesForAdapter(custom).map(source => source.id)).toEqual(["sparse"])
    expect(statesForAdapter(custom).map(state => state.id)).toEqual(["empty"])
    await expect(initialValuesForBinding(custom, { sourceId: "sparse", stateId: "empty" })).resolves.toEqual({ sourceId: "sparse", stateId: "empty" })
  })

  it("validates source status ids", () => {
    expect(isSourceStatus("ready")).toBe(true)
    expect(isSourceStatus("offline")).toBe(false)
  })
})
