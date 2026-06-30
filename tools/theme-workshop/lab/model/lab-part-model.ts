import type { Story, StoryLayer } from "../../types"
import type { LabPartsCatalog } from "../parts-discovery"
import type { LabStateOption, SourceStatus } from "./lab-source-state"

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

/** The family of a story = the story plus its linked variants, in byId order. */
function familyOf(
  story: Story,
  byId: ReadonlyMap<string, Story>,
): readonly Story[] {
  const ids = [story.id, ...(story.variants ?? [])]
  const seen = new Set<string>()
  const out: Story[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const member = byId.get(id)
    if (member) out.push(member)
  }
  return out
}

/** Resting/default states, in priority order, used to choose which family member
 * represents the family in the Parts tree (so the tree shows the "happy" state,
 * not an error one). Falls back to the family's first member. */
const RESTING_STATES = ["ready", "idle", "live", "default", "loaded", "success"]

function representativeOf(family: readonly Story[]): Story {
  for (const resting of RESTING_STATES) {
    const match = family.find(
      member => (member.state ?? "").toLowerCase() === resting,
    )
    if (match) return match
  }
  const first = family[0]
  if (!first)
    throw new Error("Cannot choose a representative for an empty family")
  return first
}

export function buildStoryIndex(
  catalog: LabPartsCatalog | null,
): LabStoryIndex {
  const stories = catalog?.stories ?? []
  const byId = new Map(stories.map(story => [story.id, story] as const))

  // Collapse each discovered state-variant family to a single tree entry (its
  // representative). All members stay in byId so the States panel can swap
  // between them; only the tree is de-duplicated.
  const absorbed = new Set<string>()
  const representatives: Story[] = []
  for (const story of stories) {
    if (absorbed.has(story.id)) continue
    const family = familyOf(story, byId)
    for (const member of family) absorbed.add(member.id)
    representatives.push(family.length > 1 ? representativeOf(family) : story)
  }

  const groups = LAB_LAYER_ORDER.map(layer => ({
    layer,
    stories: representatives.filter(story => story.layer === layer),
  })).filter(group => group.stories.length > 0)
  return { groups, byId }
}

/** The states a part can show, derived from its discovered variant family's
 * actual tags. A part with no state and no variants has none (it is stateless
 * and always renders). */
export function statesForStory(
  story: Story | null,
  byId: ReadonlyMap<string, Story>,
): readonly LabStateOption[] {
  if (!story) return []
  const family = familyOf(story, byId)
  const out: LabStateOption[] = []
  const seen = new Set<string>()
  for (const member of family) {
    const tag = member.state
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push({ id: tag, label: humanizeStateTag(tag) })
  }
  return out
}

/** Label for a part in the tree/gallery. A collapsed state-variant family is
 * named by its STATE AXIS (the part's note, e.g. "Data states") rather than the
 * single representative state, so "Home · Ready" reads as "Home · Data states" —
 * making clear it's a state set you switch in the States panel, not a distinct
 * page. Non-family parts keep their authored name. */
export function partLabel(story: Story): string {
  if (story.variants?.length && story.note) {
    const base = story.name.split(" · ")[0]
    return `${base} · ${story.note}`
  }
  return story.name
}

/** The first discovered part (in tree order) that exposes multiple states. Used
 * to populate the States panel by default so a surface's states are visible
 * without first hunting for the right part. */
export function firstStateFamilyStory(index: LabStoryIndex): Story | null {
  for (const group of index.groups) {
    for (const story of group.stories) {
      if (statesForStory(story, index.byId).length > 0) return story
    }
  }
  return null
}

function humanizeStateTag(tag: string): string {
  const spaced = tag.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export function stateVariantFor(
  story: Story,
  stateId: SourceStatus,
  byId: ReadonlyMap<string, Story>,
): Story | null {
  const want = stateId.toLowerCase()
  if ((story.state ?? "").toLowerCase() === want) return story
  for (const variantId of story.variants ?? []) {
    const variant = byId.get(variantId)
    if (variant && (variant.state ?? "").toLowerCase() === want) return variant
  }
  // A stateless part (no tag, no variants) always renders, whatever state is
  // active. A stateful part only renders for a state in its own family.
  if (!story.state && !story.variants?.length) return story
  return null
}

export function storySupportsState(
  story: Story,
  stateId: SourceStatus,
  byId: ReadonlyMap<string, Story>,
): boolean {
  return stateVariantFor(story, stateId, byId) !== null
}
