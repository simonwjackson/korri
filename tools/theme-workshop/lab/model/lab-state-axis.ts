import { humanizeTag } from "@platform/state/state-variants"

/**
 * A page part exposes one or more named state AXES — each a real state machine
 * the surface can be driven through (e.g. Shift Home's catalog Data axis and its
 * Launch axis). Parentless axes are regions: independent top-level statechart
 * regions that are simultaneously live. Nested axes declare a structural parent;
 * multi axes model 0..n active states.
 *
 * Axes are surface-owned (declared by the adapter, wired to that surface's
 * singletons), and their state lists are DERIVED from the machine's tags — never
 * hand-authored — so a new state can't be added without the axis picking it up.
 */

/** Sentinel axis value: "no pin — let the live machine drive this axis". */
export const LAB_AXIS_LIVE = "__live__"

/** The active value of a single axis: a state tag, or `LAB_AXIS_LIVE`. */
export type LabAxisValue = string

export type LabAxisKind = "single" | "multi"

export interface LabStateAxisOption {
  readonly id: string
  readonly label: string
}

export interface LabAxisParent {
  readonly axisId: string
  readonly whenStates: readonly string[]
}

export type LabAxisActive =
  | { readonly kind: "single"; readonly value: LabAxisValue }
  | { readonly kind: "multi"; readonly on: ReadonlySet<string> }

export type LabAxisCoordinate =
  | { readonly kind: "single"; readonly value: LabAxisValue }
  | { readonly kind: "multi"; readonly values: readonly string[] }

/** Per-axis active values for the current selection, keyed by axis id. */
export type LabScreenActive = Readonly<
  Record<string, LabAxisActive | undefined>
>

/** Captured live coordinate values, keyed by axis id. */
export type LabScreenCoordinate = Readonly<
  Record<string, LabAxisCoordinate | undefined>
>

export interface LabStateAxis {
  readonly id: string
  readonly kind: LabAxisKind
  readonly label: string
  readonly liveLabel: string
  readonly states: readonly LabStateAxisOption[]
  /** Pin the surface's preview singleton to this state's representative sample. */
  readonly pin: (stateId: string) => void
  /** Release every pin on this axis so the live machine drives it again. */
  readonly release: () => void
  /** Structural nesting: this axis is meaningful only while the parent is in one
   * of these states (e.g. Launch only matters when Data = Ready). */
  readonly parent?: LabAxisParent
  /** Short reason shown when the axis is greyed by `parent`. */
  readonly disabledHint?: string
}

/**
 * Build an axis `pin` from a sample table keyed by state id, looking the sample
 * up safely (no `as Tag` cast): an unknown id is a no-op rather than a crash.
 */
export function pinFromTable<S>(
  table: Readonly<Record<string, () => S>>,
  apply: (value: S) => void,
): (stateId: string) => void {
  return stateId => {
    const make = table[stateId]
    if (make) apply(make())
  }
}

/** Derive an axis's selectable options from a state machine's tags. */
export function axisOptionsFromTags(
  tags: readonly string[],
  label: (tag: string) => string = humanizeTag,
): readonly LabStateAxisOption[] {
  return tags.map(tag => ({ id: tag, label: label(tag) }))
}

/** True when an axis value means "live" (unset, single live, or empty multi). */
export function isAxisLive(value: LabAxisActive | undefined): boolean {
  if (!value) return true
  switch (value.kind) {
    case "single":
      return value.value === LAB_AXIS_LIVE
    case "multi":
      return value.on.size === 0
  }
}

/** Whether an axis is currently meaningful, honoring structural nesting. */
export function axisEnabled(
  axis: LabStateAxis,
  active: LabScreenActive,
): boolean {
  if (!axis.parent) return true
  const parent = active[axis.parent.axisId]
  if (!parent) return false
  return (
    parent.kind === "single" && axis.parent.whenStates.includes(parent.value)
  )
}

function liveAxisActive(axis: LabStateAxis): LabAxisActive {
  return axis.kind === "multi"
    ? { kind: "multi", on: new Set() }
    : { kind: "single", value: LAB_AXIS_LIVE }
}

function cloneActive(active: LabAxisActive): LabAxisActive {
  return active.kind === "multi"
    ? { kind: "multi", on: new Set(active.on) }
    : { ...active }
}

/** A fresh active map with every axis Live (no pins). */
export function liveActiveMap(axes: readonly LabStateAxis[]): LabScreenActive {
  return Object.fromEntries(axes.map(axis => [axis.id, liveAxisActive(axis)]))
}

/** Pin one axis to a state tag in the active map (others unchanged). */
export function pinAxisActive(
  active: LabScreenActive,
  axis: LabStateAxis,
  stateId: string,
): LabScreenActive {
  if (axis.kind === "multi") {
    const current = active[axis.id]
    const on =
      current?.kind === "multi" ? new Set(current.on) : new Set<string>()
    on.add(stateId)
    return { ...active, [axis.id]: { kind: "multi", on } }
  }
  return { ...active, [axis.id]: { kind: "single", value: stateId } }
}

/** Release one axis (or one multi state) in the active map (others unchanged). */
export function releaseAxisActive(
  active: LabScreenActive,
  axis: LabStateAxis,
  stateId?: string,
): LabScreenActive {
  if (axis.kind === "multi") {
    if (!stateId) return { ...active, [axis.id]: liveAxisActive(axis) }
    const current = active[axis.id]
    const on =
      current?.kind === "multi" ? new Set(current.on) : new Set<string>()
    on.delete(stateId)
    return { ...active, [axis.id]: { kind: "multi", on } }
  }
  return { ...active, [axis.id]: liveAxisActive(axis) }
}

/**
 * The active map after toggling Inspect ⇄ Live: each axis takes its remembered
 * pin (when it had one) or goes Live. Used by the global toggle to re-apply pins
 * remembered while Live.
 */
export function restorePinsActive(
  axes: readonly LabStateAxis[],
  current: LabScreenActive,
  remembered: LabScreenActive,
): LabScreenActive {
  const next: Record<string, LabAxisActive | undefined> = { ...current }
  for (const axis of axes) {
    const pin = remembered[axis.id]
    next[axis.id] =
      pin && !isAxisLive(pin) ? cloneActive(pin) : liveAxisActive(axis)
  }
  return next
}
