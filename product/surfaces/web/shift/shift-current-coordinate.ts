/**
 * Read the Shift surface's current addressable coordinate — `{ route, data,
 * launch, foreground }` — so a design tool can capture a live exploration back
 * into a frozen Inspect pin (the Live → Inspect direction).
 *
 * Data and foreground are read from what the mounted route actually resolved
 * (both driven by their real source edges, not preview singletons). Launch comes
 * from its preview singleton when pinned, else the published live tag. The
 * reader is product-side and inert in production; only a design tool calls it.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import type { ShiftCatalogState } from "./catalog/shift-catalog-state"
import { getShiftLaunchPreview } from "./shift-launch-preview"
import {
  getShiftLiveData,
  getShiftLiveForeground,
  getShiftLiveLaunch,
} from "./shift-live-coordinate"

export interface ShiftCoordinate {
  readonly route: string
  readonly data: ShiftCatalogState["_tag"]
  readonly launch: LaunchState["_tag"]
  readonly foreground: ForegroundSessionGateState["_tag"]
}

export function readShiftCurrentCoordinate(route: string): ShiftCoordinate {
  // Data reflects what the mounted route actually resolved from the real catalog
  // edge (the lab pins by swapping that source), falling back to the seed
  // resting state when nothing has been published yet.
  const data = getShiftLiveData() ?? "Ready"
  const launch = getShiftLaunchPreview()?._tag ?? getShiftLiveLaunch() ?? "Idle"
  // Foreground reflects what the mounted route resolved from its real edge.
  const foreground = getShiftLiveForeground() ?? "Ready"
  return { route, data, launch, foreground }
}
