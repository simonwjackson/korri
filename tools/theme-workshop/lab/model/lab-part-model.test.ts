import { describe, expect, it } from "bun:test"
import { buildStoryIndex, stateVariantFor } from "./lab-part-model"
import type { LabPartsCatalog } from "../parts-discovery"

const catalog: LabPartsCatalog = {
  stories: [
    { id: "home-ready", layer: "page", name: "Home Ready", state: "ready", render: () => "ready" },
    { id: "home-empty", layer: "page", name: "Home Empty", state: "empty", render: () => "empty" },
    { id: "pill", layer: "atom", name: "Pill", render: () => "pill" },
  ],
}

describe("lab part model", () => {
  it("groups stories by atomic layer and indexes by stable id", () => {
    const index = buildStoryIndex(catalog)

    expect(index.groups.map(group => group.layer)).toEqual(["page", "atom"])
    expect(index.byId.get("pill")?.name).toBe("Pill")
  })

  it("resolves local state variants without a central manifest", () => {
    const index = buildStoryIndex({
      stories: [
        { ...catalog.stories[0]!, variants: ["home-empty"] },
        catalog.stories[1]!,
      ],
    })
    const ready = index.byId.get("home-ready")!

    expect(stateVariantFor(ready, "ready", index.byId)?.id).toBe("home-ready")
    expect(stateVariantFor(ready, "empty", index.byId)?.id).toBe("home-empty")
    expect(stateVariantFor(ready, "error", index.byId)).toBeNull()
  })

  it("does not render an explicit non-ready story as ready", () => {
    const index = buildStoryIndex({
      stories: [{ id: "home-empty", layer: "page", name: "Home Empty", state: "empty", render: () => "empty" }],
    })
    const empty = index.byId.get("home-empty")!

    expect(stateVariantFor(empty, "ready", index.byId)).toBeNull()
    expect(stateVariantFor(empty, "empty", index.byId)?.id).toBe("home-empty")
  })
})
