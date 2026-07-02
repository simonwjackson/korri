import { deviceStateAtom } from "@platform/react/device/device-atoms"
import {
  DEFAULT_PICO_CLOCK_ISO,
  picoClockIsoAtom,
} from "@product/surfaces/web/pico/pico-clock-state"
import {
  DEFAULT_PICO_NETWORK_READING,
  picoNetworkReadingAtom,
  picoNetworkReadingForValue,
} from "@product/surfaces/web/pico/pico-network-state"
import {
  DEFAULT_PICO_POWER_READING,
  picoDeviceStateForPowerReading,
  picoPowerReadingForValue,
} from "@product/surfaces/web/pico/pico-power-state"
import type { Story } from "../../types"
import { eachLabTargetRegistry } from "../model/lab-surface-registries"
import type { LabSurfaceEvent, LabSurfacePartInput } from "../surface-registry"
import {
  isPicoDeviceFactStory,
  PICO_CLOCK_INPUT_CONTROL,
  PICO_CLOCK_INPUT_ID,
  PICO_NETWORK_INPUT_CONTROL,
  PICO_POWER_INPUT_CONTROL,
} from "./pico-surface-part"

/**
 * Pico's part-scoped edges: which device facts each part's real subtree
 * consumes. Edges belong to parts — a live device inherits these from the page
 * part its screen composes (model/lab-part-edges.ts) instead of declaring its
 * own screen-scoped set. Mirrors shift-edges.ts.
 */

/**
 * Pico's device events: battery (via device-state) and network arrive as
 * events in production. Emitting drives the same atoms the mounted surface
 * reads, so a fired event reaches the status bar through its real consumption
 * path rather than a lab-only shim.
 */
export function picoDeviceEvents(): readonly LabSurfaceEvent[] {
  const battery: LabSurfaceEvent = {
    id: "battery",
    label: "Battery",
    payload: PICO_POWER_INPUT_CONTROL,
    defaultPayload: DEFAULT_PICO_POWER_READING,
    emit: (payload, context) => {
      const state = picoDeviceStateForPowerReading(
        picoPowerReadingForValue(payload),
      )
      eachLabTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(deviceStateAtom, state),
      )
    },
  }
  const network: LabSurfaceEvent = {
    id: "network",
    label: "Network",
    payload: PICO_NETWORK_INPUT_CONTROL,
    defaultPayload: DEFAULT_PICO_NETWORK_READING,
    emit: (payload, context) => {
      const reading = picoNetworkReadingForValue(payload)
      eachLabTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(picoNetworkReadingAtom, reading),
      )
    },
  }
  return [battery, network]
}

/**
 * Events keyed by part story — each part exposes exactly the device facts its
 * real subtree consumes. The Status Bar and the Home / Game Detail page parts
 * that embed it consume battery + network.
 */
export function picoSurfacePartEvents(
  story: Story,
): readonly LabSurfaceEvent[] {
  return isPicoDeviceFactStory(story) ? picoDeviceEvents() : []
}

/** Clock as a LIVE held input: pin writes the real clock atom in the target
 * scope's registries; release restores the seeded value. */
function picoClockLiveInput(): LabSurfacePartInput {
  return {
    id: PICO_CLOCK_INPUT_ID,
    label: "Clock",
    defaultValue: DEFAULT_PICO_CLOCK_ISO,
    control: PICO_CLOCK_INPUT_CONTROL,
    apply: (value, context) => {
      if (typeof value !== "string") return
      eachLabTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(picoClockIsoAtom, value),
      )
    },
    release: context =>
      eachLabTargetRegistry(context?.scopeId, ({ registry, seed }) => {
        const liveValue = seed.get(picoClockIsoAtom)
        registry.set(
          picoClockIsoAtom,
          typeof liveValue === "string" ? liveValue : DEFAULT_PICO_CLOCK_ISO,
        )
      }),
  }
}

/**
 * Held inputs keyed by part story — the ambient values a part's real subtree
 * keeps reading. Battery and network are device FACTS delivered as events
 * (`picoSurfacePartEvents`), so no part holds them as inputs; the clock is the
 * pinned-and-held ambient value the status bar reads.
 */
export function picoSurfacePartInputs(
  story: Story,
): readonly LabSurfacePartInput[] {
  return isPicoDeviceFactStory(story) ? [picoClockLiveInput()] : []
}
