/**
 * Design-tool read seam: the mounted Shift route publishes its currently
 * resolved data/launch/foreground coordinate here, so the lab's "Pin current"
 * can capture a live (un-pinned) exploration — e.g. a launch state reached by
 * actually pressing play — not just whatever was already pinned.
 *
 * Written by the route (a cheap module-global assignment with no effect on
 * production rendering) and read only by the design-tool capture path. The
 * preview pins still win over this in `readShiftCurrentCoordinate`.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import type { ShiftCatalogState } from "./catalog/shift-catalog-state"

export type ShiftLiveCoordinateOwner = object

let liveData: ShiftCatalogState["_tag"] | null = null
let liveDataOwner: ShiftLiveCoordinateOwner | null = null
let liveLaunch: LaunchState["_tag"] | null = null
let liveLaunchOwner: ShiftLiveCoordinateOwner | null = null
let liveForeground: ForegroundSessionGateState["_tag"] | null = null
let liveForegroundOwner: ShiftLiveCoordinateOwner | null = null

export function createShiftLiveCoordinateOwner(): ShiftLiveCoordinateOwner {
  return {}
}

function shouldClear(
  current: ShiftLiveCoordinateOwner | null,
  owner: ShiftLiveCoordinateOwner | undefined,
): boolean {
  return owner === undefined || current === owner
}

export function setShiftLiveData(
  tag: ShiftCatalogState["_tag"],
  owner?: ShiftLiveCoordinateOwner,
): void {
  liveData = tag
  liveDataOwner = owner ?? null
}

export function clearShiftLiveData(owner?: ShiftLiveCoordinateOwner): void {
  if (!shouldClear(liveDataOwner, owner)) return
  liveData = null
  liveDataOwner = null
}

export function setShiftLiveLaunch(
  tag: LaunchState["_tag"],
  owner?: ShiftLiveCoordinateOwner,
): void {
  liveLaunch = tag
  liveLaunchOwner = owner ?? null
}

export function clearShiftLiveLaunch(owner?: ShiftLiveCoordinateOwner): void {
  if (!shouldClear(liveLaunchOwner, owner)) return
  liveLaunch = null
  liveLaunchOwner = null
}

export function setShiftLiveForeground(
  tag: ForegroundSessionGateState["_tag"],
  owner?: ShiftLiveCoordinateOwner,
): void {
  liveForeground = tag
  liveForegroundOwner = owner ?? null
}

export function clearShiftLiveForeground(
  owner?: ShiftLiveCoordinateOwner,
): void {
  if (!shouldClear(liveForegroundOwner, owner)) return
  liveForeground = null
  liveForegroundOwner = null
}

export function clearShiftLiveCoordinate(
  owner?: ShiftLiveCoordinateOwner,
): void {
  clearShiftLiveData(owner)
  clearShiftLiveLaunch(owner)
  clearShiftLiveForeground(owner)
}

export function getShiftLiveData(): ShiftCatalogState["_tag"] | null {
  return liveData
}

export function getShiftLiveLaunch(): LaunchState["_tag"] | null {
  return liveLaunch
}

export function getShiftLiveForeground():
  | ForegroundSessionGateState["_tag"]
  | null {
  return liveForeground
}
