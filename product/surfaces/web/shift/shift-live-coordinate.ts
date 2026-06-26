/**
 * Design-tool read seam: the mounted Shift route publishes its currently
 * resolved data/launch coordinate here, so the lab's "Pin current" can capture a
 * live (un-pinned) exploration — e.g. a launch state reached by actually pressing
 * play — not just whatever was already pinned.
 *
 * Written by the route (a cheap module-global assignment with no effect on
 * production rendering) and read only by the design-tool capture path. The
 * preview pins still win over this in `readShiftCurrentCoordinate`.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { ShiftCatalogState } from "./catalog/shift-catalog-state"

let liveData: ShiftCatalogState["_tag"] | null = null
let liveLaunch: LaunchState["_tag"] | null = null

export function setShiftLiveData(tag: ShiftCatalogState["_tag"]): void {
  liveData = tag
}

export function setShiftLiveLaunch(tag: LaunchState["_tag"]): void {
  liveLaunch = tag
}

export function getShiftLiveData(): ShiftCatalogState["_tag"] | null {
  return liveData
}

export function getShiftLiveLaunch(): LaunchState["_tag"] | null {
  return liveLaunch
}
