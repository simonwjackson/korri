import { deviceStateAtom } from "@platform/react/device/device-atoms"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  shiftNetworkReadingAtom,
  shiftNetworkReadingForValue,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  shiftDeviceStateForPowerReading,
  shiftPowerReadingForValue,
} from "@product/surfaces/web/shift/shift-power-state"
import type { Story } from "../../types"
import { eachLabTargetRegistry } from "../model/lab-surface-registries"
import type { LabSurfaceEvent } from "../surface-registry"
import {
  isShiftBatteryStory,
  isShiftHomeStory,
  isShiftStatusBarStory,
  SHIFT_NETWORK_INPUT_CONTROL,
  SHIFT_POWER_INPUT_CONTROL,
} from "./shift-surface-part"

/**
 * Shift's part-scoped edges: which device facts each part's real subtree
 * consumes. Edges belong to parts — a live device inherits these from the page
 * part its screen composes (model/lab-part-edges.ts) instead of declaring its
 * own screen-scoped set.
 */

/**
 * Shift's device events: the two device facts that arrive as events in
 * production — battery (via device-state) and network. Emitting drives the same
 * atoms the mounted surface reads, so a fired event reaches the surface through
 * its real consumption path rather than a lab-only shim.
 */
export function shiftDeviceEvents(): readonly LabSurfaceEvent[] {
  const battery: LabSurfaceEvent = {
    id: "battery",
    label: "Battery",
    payload: SHIFT_POWER_INPUT_CONTROL,
    defaultPayload: DEFAULT_SHIFT_POWER_READING,
    emit: (payload, context) => {
      const state = shiftDeviceStateForPowerReading(
        shiftPowerReadingForValue(payload),
      )
      eachLabTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(deviceStateAtom, state),
      )
    },
  }
  const network: LabSurfaceEvent = {
    id: "network",
    label: "Network",
    payload: SHIFT_NETWORK_INPUT_CONTROL,
    defaultPayload: DEFAULT_SHIFT_NETWORK_READING,
    emit: (payload, context) => {
      const reading = shiftNetworkReadingForValue(payload)
      eachLabTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(shiftNetworkReadingAtom, reading),
      )
    },
  }
  return [battery, network]
}

/**
 * Events keyed by part story — each part exposes exactly the device facts its
 * real subtree consumes. Home and Status Bar consume battery + network (the
 * Status Bar renders both); the Battery atom consumes only the battery fact.
 */
export function shiftSurfacePartEvents(
  story: Story,
): readonly LabSurfaceEvent[] {
  if (isShiftHomeStory(story) || isShiftStatusBarStory(story)) {
    return shiftDeviceEvents()
  }
  if (isShiftBatteryStory(story)) {
    return shiftDeviceEvents().filter(event => event.id === "battery")
  }
  return []
}
