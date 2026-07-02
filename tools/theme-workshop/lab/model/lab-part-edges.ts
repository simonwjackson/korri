import type { Story } from "../../types"
import type {
  LabSurfaceAdapter,
  LabSurfaceEvent,
  LabSurfacePartInput,
} from "../surface-registry"
import { canonicalInputValue, type LabInputValue } from "./lab-source-state"
import type { LabStateAxis } from "./lab-state-axis"

/**
 * Part-scoped edge resolution: edges (axes / inputs / events) belong to PARTS,
 * and a device inherits its edges from the page parts its screens compose —
 * it declares none of its own. There is no runtime subtree introspection; each
 * surface adapter declares which edges a part's real subtree consumes, keyed
 * by the part story (the same shape `surfacePartInputs` already uses for held
 * inputs).
 *
 * Live device objects carry no composition list — the canvas mounts a screen
 * route — so the composed page part is resolved from the route: the adapter's
 * screen entry for the path names the page part (screen label ↔ page story
 * name). Surfaces that have not migrated fall back to their legacy
 * screen-scoped declarations.
 */

/** The discrete device events a part's real subtree consumes. */
export function partEventsForStory(
  story: Story,
  adapter: Pick<LabSurfaceAdapter, "surfacePartEvents">,
): readonly LabSurfaceEvent[] {
  return adapter.surfacePartEvents?.(story) ?? []
}

/** Resolve the page part a screen route composes: by the screen's stable
 * `pagePartId` (design-part identity) when declared, falling back to screen
 * label ↔ page story name for surfaces that have not adopted ids. Returns
 * null when the surface has no matching page part. */
export function pagePartStoryForScreen(
  adapter: Pick<LabSurfaceAdapter, "screens">,
  surfacePath: string,
  stories: Iterable<Story>,
): Story | null {
  const screen = adapter.screens?.find(
    candidate => candidate.path === surfacePath,
  )
  if (!screen) return null
  let labelMatch: Story | null = null
  for (const story of stories) {
    if (story.layer !== "page") continue
    if (screen.pagePartId && story.designPartId === screen.pagePartId) {
      return story
    }
    if (labelMatch === null && story.name === screen.label) labelMatch = story
  }
  return labelMatch
}

/**
 * A live device's events, inherited from the page part its mounted screen
 * composes. Falls back to the adapter's legacy screen-scoped declaration when
 * no page part resolves (not-yet-migrated surfaces keep working unchanged).
 */
export function deviceEventsForScreen(
  adapter: Pick<
    LabSurfaceAdapter,
    "screens" | "surfacePartEvents" | "eventsForScreen"
  >,
  surfacePath: string,
  stories: Iterable<Story>,
): readonly LabSurfaceEvent[] {
  const pagePart = pagePartStoryForScreen(adapter, surfacePath, stories)
  if (pagePart && adapter.surfacePartEvents) {
    const events = adapter.surfacePartEvents(pagePart)
    if (events.length > 0) return events
  }
  return adapter.eventsForScreen?.(surfacePath) ?? []
}

/** The held product inputs a part's real subtree consumes. */
export function partInputsForStory(
  story: Story,
  adapter: Pick<LabSurfaceAdapter, "surfacePartInputs">,
): readonly LabSurfacePartInput[] {
  return adapter.surfacePartInputs?.(story) ?? []
}

/**
 * A live device's held inputs, inherited from the page part its mounted
 * screen composes — minus any input an axis already covers (the axis is the
 * richer live control for the same edge; a part-scope select is its held
 * fallback). Falls back to the adapter's legacy screen-scoped declaration
 * when no page part resolves (not-yet-migrated surfaces keep working).
 */
export function deviceInputsForScreen(
  adapter: Pick<
    LabSurfaceAdapter,
    "screens" | "surfacePartInputs" | "inputsForScreen"
  >,
  surfacePath: string,
  stories: Iterable<Story>,
  axes: readonly LabStateAxis[],
): readonly LabSurfacePartInput[] {
  const pagePart = pagePartStoryForScreen(adapter, surfacePath, stories)
  if (pagePart && adapter.surfacePartInputs) {
    const inputs = adapter.surfacePartInputs(pagePart)
    if (inputs.length > 0) {
      return inputs.filter(input => !axes.some(axis => axis.id === input.id))
    }
  }
  return adapter.inputsForScreen?.(surfacePath) ?? []
}

/** Canonicalize and dispatch one event into a scope's registered registries.
 * Returns false when the event id is unknown to the given edge set. */
export function emitScopedEvent(
  events: readonly LabSurfaceEvent[],
  scopeId: string | undefined,
  eventId: string,
  payload: LabInputValue,
): boolean {
  const event = events.find(candidate => candidate.id === eventId)
  if (!event) return false
  const canonical = canonicalInputValue(
    payload,
    event.payload,
    event.defaultPayload,
  )
  event.emit(canonical, scopeId === undefined ? undefined : { scopeId })
  return true
}
