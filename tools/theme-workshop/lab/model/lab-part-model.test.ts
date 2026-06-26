import { describe, expect, it } from "bun:test"
import { buildStoryIndex, statesForStory, stateVariantFor } from "./lab-part-model"
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

  it("renders a stateless part for any active state", () => {
    const index = buildStoryIndex({ stories: [{ id: "pill", layer: "atom", name: "Pill", render: () => "pill" }] })
    const pill = index.byId.get("pill")!

    expect(stateVariantFor(pill, "ready", index.byId)?.id).toBe("pill")
    expect(stateVariantFor(pill, "Loading", index.byId)?.id).toBe("pill")
  })

  it("collapses a dynamic-tag state family to one tree entry and derives its states", () => {
    const index = buildStoryIndex({
      stories: [
        { id: "home-loading", layer: "page", name: "Home · Loading", state: "Loading", variants: ["home-ready", "home-loaderror"], render: () => "l" },
        { id: "home-ready", layer: "page", name: "Home · Ready", state: "Ready", variants: ["home-loading", "home-loaderror"], render: () => "r" },
        { id: "home-loaderror", layer: "page", name: "Home · Load error", state: "LoadError", variants: ["home-loading", "home-ready"], render: () => "e" },
      ],
    })

    // One representative in the tree (the Ready member), all three in byId.
    expect(index.groups[0]?.stories.map(story => story.id)).toEqual(["home-ready"])
    expect(index.byId.size).toBe(3)

    // States derived from the family's real tags (no fixed vocabulary).
    const rep = index.byId.get("home-ready")!
    expect(statesForStory(rep, index.byId).map(state => state.id)).toEqual(["Ready", "Loading", "LoadError"])
    expect(statesForStory(rep, index.byId).map(state => state.label)).toEqual(["Ready", "Loading", "Load error"])

    // Switching to a dynamic tag resolves the right family member.
    expect(stateVariantFor(rep, "LoadError", index.byId)?.id).toBe("home-loaderror")
  })

  it("reports no states for a stateless part", () => {
    const index = buildStoryIndex({ stories: [{ id: "pill", layer: "atom", name: "Pill", render: () => "pill" }] })
    expect(statesForStory(index.byId.get("pill")!, index.byId)).toEqual([])
    expect(statesForStory(null, index.byId)).toEqual([])
  })
})
