import { describe, expect, it } from "bun:test"
import type { CatalogEntry } from "./catalog-facts-source"
import {
  CATALOG_DISPLAY_TAGS,
  makeCatalogStateSamples,
} from "./catalog-state-samples"

const entries: readonly CatalogEntry[] = [
  {
    id: "celeste",
    itemId: "celeste",
    title: "Celeste",
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  },
]

describe("makeCatalogStateSamples", () => {
  it("builds a sample for every catalog display tag (exhaustive)", () => {
    const samples = makeCatalogStateSamples(entries)
    expect(Object.keys(samples).sort()).toEqual(
      [...CATALOG_DISPLAY_TAGS].sort(),
    )
  })

  it("seeds Ready with the supplied entries and Empty with none", () => {
    const samples = makeCatalogStateSamples(entries)
    const ready = samples.Ready()
    const empty = samples.Empty()
    expect(ready._tag).toBe("Success")
    expect(empty._tag).toBe("Success")
    if (ready._tag === "Success") expect(ready.value.entries).toHaveLength(1)
    if (empty._tag === "Success") expect(empty.value.entries).toHaveLength(0)
  })

  it("applies custom offline and defect messages", () => {
    const samples = makeCatalogStateSamples(entries, {
      offlineMessage: "Library is offline",
      defectMessage: "boom",
    })
    const error = samples.LoadError()
    expect(error._tag).toBe("Failure")
    if (error._tag === "Failure")
      expect(String(error.cause)).toContain("Library is offline")
  })
})
