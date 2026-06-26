import { humanizeTag } from "@platform/state/state-variants"
import type { ReactNode } from "react"

/**
 * A page part exposes one or more named state AXES — each a real state machine
 * the surface can be driven through (e.g. Shift Home's catalog Data axis and its
 * Launch axis). The lab renders each axis as a group with a "Live" chip plus its
 * states; pinning a state drives the surface's production-inert preview
 * singleton, and releasing it hands the axis back to the live machine.
 *
 * Axes are surface-owned (declared by the adapter, wired to that surface's
 * singletons), and their state lists are DERIVED from the machine's tags — never
 * hand-authored — so a new state can't be added without the axis picking it up.
 */

/** Sentinel axis value: "no pin — let the live machine drive this axis". */
export const LAB_AXIS_LIVE = "__live__"

/** The active value of an axis: a state tag, or `LAB_AXIS_LIVE`. */
export type LabAxisValue = string

export interface LabStateAxisOption {
  readonly id: string
  readonly label: string
}

/** Per-axis active values for the current selection, keyed by axis id. */
export type LabAxisActiveMap = Readonly<Record<string, LabAxisValue>>

export interface LabStateAxis {
  readonly id: string
  readonly label: string
  readonly liveLabel: string
  readonly states: readonly LabStateAxisOption[]
  /** Pin the surface's preview singleton to this state's representative sample. */
  readonly pin: (stateId: string) => void
  /** Release the pin so the live machine drives this axis again. */
  readonly release: () => void
  /** When present, the axis is only meaningful while this holds over the current
   * per-axis active map (e.g. Launch only matters when Data = Ready). */
  readonly enabledWhen?: (active: LabAxisActiveMap) => boolean
  /** Short reason shown when the axis is greyed by `enabledWhen`. */
  readonly disabledHint?: string
  /** A seeded STATIC render of this axis at one state, for the Matrix fan-out
   * (every value side by side) — no live mount. Driven by the same sample table
   * as the pin, so the static fan and the live pin can never drift. */
  readonly renderSample?: (stateId: string) => ReactNode
}

/** Derive an axis's selectable options from a state machine's tags. */
export function axisOptionsFromTags(
  tags: readonly string[],
  label: (tag: string) => string = humanizeTag,
): readonly LabStateAxisOption[] {
  return tags.map(tag => ({ id: tag, label: label(tag) }))
}

/** True when an axis value means "live" (unset or the live sentinel). */
export function isAxisLive(value: LabAxisValue | undefined): boolean {
  return value === undefined || value === LAB_AXIS_LIVE
}

/** Whether an axis is currently meaningful, honoring its `enabledWhen` nesting. */
export function axisEnabled(
  axis: LabStateAxis,
  active: LabAxisActiveMap,
): boolean {
  return axis.enabledWhen ? axis.enabledWhen(active) : true
}

/** A fresh active map with every axis Live (no pins). */
export function liveActiveMap(axes: readonly LabStateAxis[]): LabAxisActiveMap {
  return Object.fromEntries(axes.map(axis => [axis.id, LAB_AXIS_LIVE]))
}

/** Pin one axis to a state tag in the active map (others unchanged). */
export function pinAxisActive(
  active: LabAxisActiveMap,
  axisId: string,
  stateId: string,
): LabAxisActiveMap {
  return { ...active, [axisId]: stateId }
}

/** Release one axis (set Live) in the active map (others unchanged). */
export function releaseAxisActive(
  active: LabAxisActiveMap,
  axisId: string,
): LabAxisActiveMap {
  return { ...active, [axisId]: LAB_AXIS_LIVE }
}

/**
 * The active map after toggling Inspect ⇄ Live: each axis takes its remembered
 * pin (when it had one) or goes Live. Used by the global toggle to re-apply pins
 * remembered while Live.
 */
export function restorePinsActive(
  axes: readonly LabStateAxis[],
  current: LabAxisActiveMap,
  remembered: LabAxisActiveMap,
): LabAxisActiveMap {
  const next: Record<string, LabAxisValue> = { ...current }
  for (const axis of axes) {
    const pin = remembered[axis.id]
    next[axis.id] = pin && !isAxisLive(pin) ? pin : LAB_AXIS_LIVE
  }
  return next
}
