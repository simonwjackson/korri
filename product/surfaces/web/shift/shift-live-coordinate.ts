/**
 * Live coordinate capture for the Shift Home surface.
 *
 * Written by the route (a cheap module-global assignment with no effect on
 * production rendering) and read only by the design-tool capture path. The
 * dials themselves drive real source atoms; this seam only remembers what the
 * mounted route most recently resolved so "Pin current" can capture it.
 */
import type { LaunchState } from "@platform/library/launch-state"
import type { ForegroundSessionGateState } from "@platform/session/foreground-session-gate-state"
import type { ShiftCatalogState } from "./catalog/shift-catalog-state"
import type { ShiftClockIso } from "./shift-clock-state"
import type { ShiftNetworkReading } from "./shift-network-state"
import type { ShiftPowerReading } from "./shift-power-state"

export type ShiftLiveCoordinateOwner = object

let liveData: ShiftCatalogState["_tag"] | null = null
let liveDataOwner: ShiftLiveCoordinateOwner | null = null
let liveLaunch: LaunchState["_tag"] | null = null
let liveLaunchOwner: ShiftLiveCoordinateOwner | null = null
let liveForeground: ForegroundSessionGateState["_tag"] | null = null
let liveForegroundOwner: ShiftLiveCoordinateOwner | null = null
let livePower: ShiftPowerReading | null = null
let livePowerOwner: ShiftLiveCoordinateOwner | null = null
let liveClock: ShiftClockIso | null = null
let liveClockOwner: ShiftLiveCoordinateOwner | null = null
let liveNetwork: ShiftNetworkReading | null = null
let liveNetworkOwner: ShiftLiveCoordinateOwner | null = null

export function createShiftLiveCoordinateOwner(): ShiftLiveCoordinateOwner {
  return {}
}

function shouldClear(
  currentOwner: ShiftLiveCoordinateOwner | null,
  owner: ShiftLiveCoordinateOwner | undefined,
): boolean {
  return !owner || !currentOwner || currentOwner === owner
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

export function setShiftLivePower(
  reading: ShiftPowerReading,
  owner?: ShiftLiveCoordinateOwner,
): void {
  livePower = reading
  livePowerOwner = owner ?? null
}

export function clearShiftLivePower(owner?: ShiftLiveCoordinateOwner): void {
  if (!shouldClear(livePowerOwner, owner)) return
  livePower = null
  livePowerOwner = null
}

export function setShiftLiveClock(
  iso: ShiftClockIso,
  owner?: ShiftLiveCoordinateOwner,
): void {
  liveClock = iso
  liveClockOwner = owner ?? null
}

export function clearShiftLiveClock(owner?: ShiftLiveCoordinateOwner): void {
  if (!shouldClear(liveClockOwner, owner)) return
  liveClock = null
  liveClockOwner = null
}

export function setShiftLiveNetwork(
  reading: ShiftNetworkReading,
  owner?: ShiftLiveCoordinateOwner,
): void {
  liveNetwork = reading
  liveNetworkOwner = owner ?? null
}

export function clearShiftLiveNetwork(owner?: ShiftLiveCoordinateOwner): void {
  if (!shouldClear(liveNetworkOwner, owner)) return
  liveNetwork = null
  liveNetworkOwner = null
}

export function clearShiftLiveCoordinate(
  owner?: ShiftLiveCoordinateOwner,
): void {
  clearShiftLiveData(owner)
  clearShiftLiveLaunch(owner)
  clearShiftLiveForeground(owner)
  clearShiftLivePower(owner)
  clearShiftLiveClock(owner)
  clearShiftLiveNetwork(owner)
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

export function getShiftLivePower(): ShiftPowerReading | null {
  return livePower
}

export function getShiftLiveClock(): ShiftClockIso | null {
  return liveClock
}

export function getShiftLiveNetwork(): ShiftNetworkReading | null {
  return liveNetwork
}
