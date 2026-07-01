/**
 * Read the Shift surface's current addressable coordinate — `{ route, data,
 * launch, foreground, power, clock, network }` — so a design tool can capture a
 * live exploration back into a frozen Inspect pin (the Live → Inspect
 * direction).
 *
 * Data, launch, and foreground are read from what the mounted route actually
 * resolved (driven by real source edges / the real launch controller, not
 * preview singletons). The reader is product-side and inert in production; only
 * a design tool calls it.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { ForegroundSessionGateState } from "@platform/stream/foreground-session-gate-state"
import type { ShiftCatalogState } from "./catalog/shift-catalog-state"
import { DEFAULT_SHIFT_CLOCK_ISO } from "./shift-clock-state"
import {
  getShiftLiveClock,
  getShiftLiveData,
  getShiftLiveForeground,
  getShiftLiveLaunch,
  getShiftLiveNetwork,
  getShiftLivePower,
} from "./shift-live-coordinate"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  type ShiftNetworkReading,
} from "./shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  type ShiftPowerReading,
} from "./shift-power-state"

export interface ShiftCoordinate {
  readonly route: string
  readonly data: ShiftCatalogState["_tag"]
  readonly launch: LaunchState["_tag"]
  readonly foreground: ForegroundSessionGateState["_tag"]
  readonly power: ShiftPowerReading
  readonly clock: string
  readonly network: ShiftNetworkReading
}

export function readShiftCurrentCoordinate(route: string): ShiftCoordinate {
  // Data reflects what the mounted route actually resolved from the real catalog
  // edge (the lab pins by swapping that source), falling back to the seed
  // resting state when nothing has been published yet.
  const data = getShiftLiveData() ?? "Ready"
  const launch = getShiftLiveLaunch() ?? "Idle"
  // Foreground reflects what the mounted route resolved from its real edge.
  const foreground = getShiftLiveForeground() ?? "Ready"
  const power = getShiftLivePower() ?? DEFAULT_SHIFT_POWER_READING
  const clock = getShiftLiveClock() ?? DEFAULT_SHIFT_CLOCK_ISO
  const network = getShiftLiveNetwork() ?? DEFAULT_SHIFT_NETWORK_READING
  return { route, data, launch, foreground, power, clock, network }
}
