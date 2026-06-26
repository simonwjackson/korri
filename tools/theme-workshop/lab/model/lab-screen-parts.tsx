import type { Story } from "../../types"
import { LabScreenPlaceholder } from "../components/LabScreenPlaceholder"
import type { LabSurfaceScreen } from "../surface-registry"
import type { LabStoryIndex } from "./lab-part-model"

/**
 * A surface's screens ARE its page parts: each `adapter.screens` entry becomes a
 * page-layer Story carrying its route (`screenPath`). Selecting one mounts the
 * live surface at that route and drives it through its axes — converging
 * "navigate" and "isolate" onto one object. Atoms/molecules stay static.
 */

export function screenStoryId(path: string): string {
  return `__screen__${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function screenStories(
  screens: readonly LabSurfaceScreen[],
): readonly Story[] {
  return screens.map(screen => ({
    id: screenStoryId(screen.path),
    layer: "page" as const,
    name: screen.label,
    note: "Screen",
    surface: true,
    screenPath: screen.path,
    // Mounted live in the Selection view; static contexts (gallery/matrix) show
    // a hint rather than a blank card.
    render: () => (
      <LabScreenPlaceholder label={`${screen.label} — open in Selection`} />
    ),
  }))
}

/** Inject the surface's screen page parts at the front of the page group. */
export function withScreenStories(
  index: LabStoryIndex,
  screens: readonly LabSurfaceScreen[],
): LabStoryIndex {
  const extra = screenStories(screens)
  if (extra.length === 0) return index

  const byId = new Map(index.byId)
  for (const story of extra) byId.set(story.id, story)

  const hasPage = index.groups.some(group => group.layer === "page")
  const groups = hasPage
    ? index.groups.map(group =>
        group.layer === "page"
          ? { ...group, stories: [...extra, ...group.stories] }
          : group,
      )
    : [{ layer: "page" as const, stories: extra }, ...index.groups]

  return { groups, byId }
}
