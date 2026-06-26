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

export interface ShiftCoordinate {
  readonly route: string
  readonly data: ShiftCatalogState["_tag"]
  readonly launch: LaunchState["_tag"]
}

export function readShiftCurrentCoordinate(route: string): ShiftCoordinate {
  const pinnedData = getShiftCatalogPreview()
  const data = pinnedData
    ? ShiftCatalogState.fromResult(pinnedData)._tag
    : "Ready"
  const launch = getShiftLaunchPreview()?._tag ?? "Idle"
  return { route, data, launch }
}
