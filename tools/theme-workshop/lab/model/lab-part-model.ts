import type { Story, StoryLayer } from "../../types"
import type { LabPartsCatalog } from "../parts-discovery"
import type { SourceStatus } from "./lab-source-state"

export const LAB_LAYER_ORDER: readonly StoryLayer[] = [
  "page",
  "template",
  "organism",
  "molecule",
  "atom",
]

export type LabStoryGroup = {
  readonly layer: StoryLayer
  readonly stories: readonly Story[]
}

export type LabStoryIndex = {
  readonly groups: readonly LabStoryGroup[]
  readonly byId: ReadonlyMap<string, Story>
}

export function buildStoryIndex(catalog: LabPartsCatalog | null): LabStoryIndex {
  const stories = catalog?.stories ?? []
  const byId = new Map(stories.map(story => [story.id, story] as const))
  const groups = LAB_LAYER_ORDER.map(layer => ({
    layer,
    stories: stories.filter(story => story.layer === layer),
  })).filter(group => group.stories.length > 0)
  return { groups, byId }
}

export function stateVariantFor(
  story: Story,
  stateId: SourceStatus,
  byId: ReadonlyMap<string, Story>,
): Story | null {
  if (story.state === stateId) return story
  for (const variantId of story.variants ?? []) {
    const variant = byId.get(variantId)
    if (variant?.state === stateId) return variant
  }
  return stateId === "ready" && (!story.state || story.state === "ready") ? story : null
}

export function storySupportsState(
  story: Story,
  stateId: SourceStatus,
  byId: ReadonlyMap<string, Story>,
): boolean {
  return stateVariantFor(story, stateId, byId) !== null
}
