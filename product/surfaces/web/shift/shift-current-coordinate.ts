/**
 * Read the Shift surface's current addressable coordinate — `{ route, data,
 * launch, foreground }` — so a design tool can capture a live exploration back
 * into a frozen Inspect pin (the Live → Inspect direction).
 *
 * The data/launch/foreground tags come from the preview singletons when pinned;
 * when an axis is Live, it reflects what the mounted route published, falling
 * back to the seed resting state when nothing has been published yet. The reader
 * is product-side and inert in production; only a design tool calls it.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import { ShiftCatalogState } from "./catalog/shift-catalog-state"
import { getShiftCatalogPreview } from "./shift-catalog-preview"
import { getShiftForegroundPreview } from "./shift-foreground-preview"
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
  // A pin wins; otherwise read what the mounted route actually resolved (so a
  // live, un-pinned state is captured), falling back to the seed resting state
  // when nothing has been published yet.
  const pinnedData = getShiftCatalogPreview()
  const data = pinnedData
    ? ShiftCatalogState.fromResult(pinnedData)._tag
    : (getShiftLiveData() ?? "Ready")
  const launch = getShiftLaunchPreview()?._tag ?? getShiftLiveLaunch() ?? "Idle"
  const foreground =
    getShiftForegroundPreview()?._tag ?? getShiftLiveForeground() ?? "Ready"
  return { route, data, launch, foreground }
}
