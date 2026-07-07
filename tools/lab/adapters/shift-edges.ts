import {
  deviceStateFromFacts,
  unknownDeviceState,
} from "@platform/device/device-facts"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockIsoAtom,
} from "@product/surfaces/web/shift/shift-clock-state"
import { FOREGROUND_SESSION_GATE_STATE_TAGS } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  shiftDeviceNetworkStateForNetworkReading,
  shiftNetworkReadingForValue,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  shiftDeviceStateForPowerReading,
  shiftPowerReadingForValue,
} from "@product/surfaces/web/shift/shift-power-state"
import type { Story } from "@simonwjackson/caliper"
import { eachLabTargetRegistry } from "@simonwjackson/caliper/adapter-kit"
import type { LabSurfaceEvent, LabSurfacePartInput } from "@simonwjackson/caliper"
import {
  isShiftBatteryStory,
  isShiftHomeStory,
  isShiftStatusBarStory,
  SHIFT_CLOCK_INPUT_CONTROL,
  SHIFT_CLOCK_INPUT_ID,
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
      eachLabTargetRegistry(context?.scopeId, ({ registry }) => {
        const current = registry.get(deviceStateAtom) ?? unknownDeviceState()
        registry.set(
          deviceStateAtom,
          deviceStateFromFacts({
            battery: state.battery,
            network: current.network,
            observedAt: state.observedAt,
          }),
        )
      })
    },
  }
  const network: LabSurfaceEvent = {
    id: "network",
    label: "Network",
    payload: SHIFT_NETWORK_INPUT_CONTROL,
    defaultPayload: DEFAULT_SHIFT_NETWORK_READING,
    emit: (payload, context) => {
      const reading = shiftNetworkReadingForValue(payload)
      const network = shiftDeviceNetworkStateForNetworkReading(reading)
      eachLabTargetRegistry(context?.scopeId, ({ registry }) => {
        const current = registry.get(deviceStateAtom) ?? unknownDeviceState()
        registry.set(
          deviceStateAtom,
          deviceStateFromFacts({
            battery: current.battery,
            network,
            observedAt: network.observedAt,
          }),
        )
      })
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

/** Clock as a LIVE held input: pin writes the real clock atom in the target
 * scope's registries; release restores the seeded value — the same dispatch
 * shape for a live device and a live-mounted placed part. */
function shiftClockLiveInput(): LabSurfacePartInput {
  return {
    id: SHIFT_CLOCK_INPUT_ID,
    label: "Clock",
    defaultValue: DEFAULT_SHIFT_CLOCK_ISO,
    control: SHIFT_CLOCK_INPUT_CONTROL,
    apply: (value, context) => {
      if (typeof value !== "string") return
      eachLabTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(shiftClockIsoAtom, value),
      )
    },
    release: context =>
      eachLabTargetRegistry(context?.scopeId, ({ registry, seed }) => {
        const liveValue = seed.get(shiftClockIsoAtom)
        registry.set(
          shiftClockIsoAtom,
          typeof liveValue === "string" ? liveValue : DEFAULT_SHIFT_CLOCK_ISO,
        )
      }),
  }
}

function shiftForegroundInput(): LabSurfacePartInput {
  return {
    id: "foreground",
    label: "Foreground",
    defaultValue: "Ready",
    control: {
      kind: "select",
      options: FOREGROUND_SESSION_GATE_STATE_TAGS.map(tag => ({
        id: tag,
        label: tag,
      })),
    },
  }
}

/**
 * Held inputs keyed by part story — the ambient values a part's real subtree
 * keeps reading. Battery and network are device FACTS delivered as events
 * (`shiftSurfacePartEvents`), so no part holds them as inputs; the clock is
 * the pinned-and-held ambient value, and Home additionally holds the
 * foreground gate (a live device renders foreground as an axis instead — see
 * `deviceInputsForScreen`, which drops part inputs an axis already covers).
 */
export function shiftSurfacePartInputs(
  story: Story,
): readonly LabSurfacePartInput[] {
  if (isShiftStatusBarStory(story)) return [shiftClockLiveInput()]
  if (isShiftHomeStory(story)) {
    return [shiftForegroundInput(), shiftClockLiveInput()]
  }
  return []
}
