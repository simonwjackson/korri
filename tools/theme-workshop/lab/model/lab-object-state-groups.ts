import type { Story } from "../../types"
import type { LabSurfaceAdapter } from "../surface-registry"
import { statesForStory } from "./lab-part-model"
import type { LabStateOption, SourceStatus } from "./lab-source-state"

export const LAB_VARIANT_STATE_GROUP_ID = "variant"
export const LAB_VARIANT_STATE_GROUP_ROLE = "variant"

export type LabObjectStateGroupRole = typeof LAB_VARIANT_STATE_GROUP_ROLE

export type LabObjectStateGroup = {
  readonly id: string
  readonly label: string
  readonly states: readonly LabStateOption[]
  readonly defaultStateId: SourceStatus
  /** Render role only: this group selects the concrete story variant. The
   * Inspector still renders it exactly like every other group. */
  readonly role?: LabObjectStateGroupRole
}

const RESTING_STATES = ["ready", "idle", "live", "default", "loaded", "success"]

export function objectStateGroupsForStory(
  story: Story,
  byId: ReadonlyMap<string, Story>,
  adapter: Pick<LabSurfaceAdapter, "surfacePartStateGroups">,
): readonly LabObjectStateGroup[] {
  const groups: LabObjectStateGroup[] = []
  const variantStates = statesForStory(story, byId)
  if (variantStates.length > 0) {
    const label = stateGroupLabelForStory(story)
    groups.push({
      id: LAB_VARIANT_STATE_GROUP_ID,
      label,
      role: LAB_VARIANT_STATE_GROUP_ROLE,
      defaultStateId: defaultStateIdFor(variantStates),
      states: variantStates,
    })
  }

  for (const group of adapter.surfacePartStateGroups?.(story) ?? []) {
    if (group.states.length === 0) continue
    groups.push({
      id: group.id,
      label: group.label,
      defaultStateId: canonicalStateId(
        group.states,
        group.defaultStateId ?? group.states[0]?.id,
      ),
      states: group.states,
    })
  }

  assertUniqueGroupIds(groups)
  return groups
}

export function variantStateGroup(
  groups: readonly LabObjectStateGroup[],
): LabObjectStateGroup | null {
  return (
    groups.find(group => group.role === LAB_VARIANT_STATE_GROUP_ROLE) ?? null
  )
}

export function resolveObjectStateGroupValues(
  groups: readonly LabObjectStateGroup[],
  storedValues: Readonly<Record<string, SourceStatus>> | undefined,
): Readonly<Record<string, SourceStatus>> {
  const out: Record<string, SourceStatus> = {}
  for (const group of groups) {
    out[group.id] = canonicalStateId(
      group.states,
      storedValues?.[group.id] ?? group.defaultStateId,
    )
  }
  return out
}

function stateGroupLabelForStory(story: Story): string {
  const raw = story.note?.trim() || "State"
  return raw.replace(/\s+states?$/i, "") || "State"
}

function defaultStateIdFor(states: readonly LabStateOption[]): SourceStatus {
  for (const resting of RESTING_STATES) {
    const match = states.find(state => state.id.toLowerCase() === resting)
    if (match) return match.id
  }
  const first = states[0]
  if (!first)
    throw new Error("Cannot choose a default for an empty state group")
  return first.id
}

function canonicalStateId(
  states: readonly LabStateOption[],
  value: SourceStatus | undefined,
): SourceStatus {
  const fallback = defaultStateIdFor(states)
  if (!value) return fallback
  const match = states.find(
    state => state.id.toLowerCase() === value.toLowerCase(),
  )
  return match?.id ?? fallback
}

function assertUniqueGroupIds(groups: readonly LabObjectStateGroup[]): void {
  const seen = new Set<string>()
  for (const group of groups) {
    if (seen.has(group.id))
      throw new Error(`Duplicate object state group id ${group.id}`)
    seen.add(group.id)
  }
}
