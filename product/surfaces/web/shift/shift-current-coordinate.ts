/**
 * Read the Shift surface's current addressable coordinate — `{ route, data,
 * launch }` — so a design tool can capture a live exploration back into a frozen
 * Inspect pin (the Live → Inspect direction).
 *
 * The data/launch tags come from the preview singletons when pinned; when an
 * axis is Live, it reflects the seed's resting state (Ready data, Idle launch) —
 * source-layer seeds for non-Ready Live are deferred (see the plan). The reader
 * is product-side and inert in production; only a design tool calls it.
 */
import type { LaunchState } from "@platform/library/launch-state"
import { ShiftCatalogState } from "./catalog/shift-catalog-state"
import { getShiftCatalogPreview } from "./shift-catalog-preview"
import { getShiftLaunchPreview } from "./shift-launch-preview"
import { getShiftLiveData, getShiftLiveLaunch } from "./shift-live-coordinate"

export interface ShiftCoordinate {
  readonly route: string
  readonly data: ShiftCatalogState["_tag"]
  readonly launch: LaunchState["_tag"]
}

export function readShiftCurrentCoordinate(route: string): ShiftCoordinate {
  // A pin wins; otherwise read what the mounted route actually resolved (so a
  // live, un-pinned launch state is captured), falling back to the seed resting
  // state when nothing has been published yet.
  const pinnedData = getShiftCatalogPreview()
  const data = pinnedData
    ? ShiftCatalogState.fromResult(pinnedData)._tag
    : (getShiftLiveData() ?? "Ready")
  const launch = getShiftLaunchPreview()?._tag ?? getShiftLiveLaunch() ?? "Idle"
  return { route, data, launch }
}
