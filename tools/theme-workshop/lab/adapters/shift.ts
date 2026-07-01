import { deviceStateAtom } from "@platform/react/device/device-atoms"
import { shiftConfig } from "@product/surfaces/web/shift/config"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { SHIFT_COMPANION_PATH } from "@product/surfaces/web/shift/routes/paths"
import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockIsoAtom,
} from "@product/surfaces/web/shift/shift-clock-state"
import { FOREGROUND_SESSION_GATE_STATE_TAGS } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  shiftNetworkReadingAtom,
  shiftNetworkReadingForValue,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  shiftDeviceStateForPowerReading,
  shiftPowerReadingAtom,
  shiftPowerReadingForValue,
} from "@product/surfaces/web/shift/shift-power-state"
import type { RouterHistory } from "@tanstack/history"
import {
  eachLabSurfaceRegistry,
  eachLabSurfaceRegistryForScope,
  type LabSurfaceRegistryEntry,
} from "../model/lab-surface-registries"
import {
  makeSeedInitialValues,
  makeSeedInitialValuesForBinding,
  type SeedInitialValues,
  shiftLabSources,
} from "../seed/shift-seed"
import type {
  LabSurfaceAdapter,
  LabSurfaceEvent,
  LabSurfacePartInput,
} from "../surface-registry"
import { shiftAxesForScreen, shiftCaptureCoordinate } from "./shift-axes"
import {
  renderShiftSurfacePart,
  SHIFT_CLOCK_INPUT_CONTROL,
  SHIFT_CLOCK_INPUT_ID,
  SHIFT_NETWORK_INPUT_CONTROL,
  SHIFT_NETWORK_INPUT_ID,
  SHIFT_POWER_INPUT_CONTROL,
  SHIFT_POWER_INPUT_ID,
} from "./shift-surface-part"

function eachTargetRegistry(
  scopeId: string | undefined,
  run: (entry: LabSurfaceRegistryEntry) => void,
): void {
  if (scopeId) {
    eachLabSurfaceRegistryForScope(scopeId, run)
    return
  }
  eachLabSurfaceRegistry(run)
}

function shiftStatusInputs(live: boolean): readonly LabSurfacePartInput[] {
  const power: LabSurfacePartInput = {
    id: SHIFT_POWER_INPUT_ID,
    label: "Power",
    defaultValue: DEFAULT_SHIFT_POWER_READING,
    control: SHIFT_POWER_INPUT_CONTROL,
    apply: live
      ? (value, context) => {
          const reading = shiftPowerReadingForValue(value)
          eachTargetRegistry(context?.scopeId, ({ registry }) =>
            registry.set(shiftPowerReadingAtom, reading),
          )
        }
      : undefined,
    release: live
      ? context =>
          eachTargetRegistry(context?.scopeId, ({ registry, seed }) => {
            registry.set(
              shiftPowerReadingAtom,
              shiftPowerReadingForValue(
                seed.get(shiftPowerReadingAtom) ?? DEFAULT_SHIFT_POWER_READING,
              ),
            )
          })
      : undefined,
  }
  const clock: LabSurfacePartInput = {
    id: SHIFT_CLOCK_INPUT_ID,
    label: "Clock",
    defaultValue: DEFAULT_SHIFT_CLOCK_ISO,
    control: SHIFT_CLOCK_INPUT_CONTROL,
    apply: live
      ? (value, context) => {
          if (typeof value !== "string") return
          eachTargetRegistry(context?.scopeId, ({ registry }) =>
            registry.set(shiftClockIsoAtom, value),
          )
        }
      : undefined,
    release: live
      ? context =>
          eachTargetRegistry(context?.scopeId, ({ registry, seed }) => {
            const liveValue = seed.get(shiftClockIsoAtom)
            registry.set(
              shiftClockIsoAtom,
              typeof liveValue === "string"
                ? liveValue
                : DEFAULT_SHIFT_CLOCK_ISO,
            )
          })
      : undefined,
  }
  const network: LabSurfacePartInput = {
    id: SHIFT_NETWORK_INPUT_ID,
    label: "Network",
    defaultValue: DEFAULT_SHIFT_NETWORK_READING,
    control: SHIFT_NETWORK_INPUT_CONTROL,
    apply: live
      ? (value, context) => {
          const reading = shiftNetworkReadingForValue(value)
          eachTargetRegistry(context?.scopeId, ({ registry }) =>
            registry.set(shiftNetworkReadingAtom, reading),
          )
        }
      : undefined,
    release: live
      ? context =>
          eachTargetRegistry(context?.scopeId, ({ registry, seed }) => {
            registry.set(
              shiftNetworkReadingAtom,
              shiftNetworkReadingForValue(
                seed.get(shiftNetworkReadingAtom) ??
                  DEFAULT_SHIFT_NETWORK_READING,
              ),
            )
          })
      : undefined,
  }
  return [power, clock, network]
}

/**
 * Shift's device events: the two device facts that arrive as events in
 * production — battery (via device-state) and network. Emitting drives the same
 * atoms the mounted surface reads, so a fired event reaches the surface through
 * its real consumption path rather than a lab-only shim.
 */
function shiftDeviceEvents(): readonly LabSurfaceEvent[] {
  const battery: LabSurfaceEvent = {
    id: "battery",
    label: "Battery",
    payload: SHIFT_POWER_INPUT_CONTROL,
    defaultPayload: DEFAULT_SHIFT_POWER_READING,
    emit: (payload, context) => {
      const state = shiftDeviceStateForPowerReading(
        shiftPowerReadingForValue(payload),
      )
      eachTargetRegistry(context?.scopeId, ({ registry }) =>
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
      eachTargetRegistry(context?.scopeId, ({ registry }) =>
        registry.set(shiftNetworkReadingAtom, reading),
      )
    },
  }
  return [battery, network]
}

export const shiftLabSurfaceAdapter: LabSurfaceAdapter = {
  id: "shift",
  devices: shiftConfig.devices,
  screens: [
    { label: "Home", path: "/" },
    { label: "Game Detail", path: "/game/hollow-knight" },
  ],
  knobs: shiftConfig.knobs,
  defaultPxPerMm: shiftConfig.defaultPxPerMm,
  secondaryScreenPath: SHIFT_COMPANION_PATH,
  axesForScreen: shiftAxesForScreen,
  // Live Home inputs are the ambient values the operator pins-and-holds (clock).
  // Battery and network are device FACTS delivered as events, so they live under
  // `eventsForScreen` instead of held inputs.
  inputsForScreen: screenPath =>
    screenPath === "/"
      ? shiftStatusInputs(true).filter(input => input.id === "clock")
      : [],
  eventsForScreen: screenPath =>
    screenPath === "/" ? shiftDeviceEvents() : [],
  captureCoordinate: shiftCaptureCoordinate,
  // Shift's Data + Foreground state machines are surfaced as Home screen axes
  // (see shift-axes.tsx). Launch is produced by pressing Play against the real
  // in-memory launcher, not injected as a lab axis/control.
  sources: shiftLabSources,
  renderSurfacePart: renderShiftSurfacePart,
  // These are real inputs the Shift components/page can consume. Home exposes
  // Foreground plus Power plus Clock plus Network; Battery exposes Power; Status
  // Bar exposes Power plus Clock plus Network.
  surfacePartInputs: story => {
    const [power, clock, network] = shiftStatusInputs(false)
    if (story.layer === "atom" && story.name === "Battery") return [power]
    if (story.layer === "molecule" && story.name === "Status Bar")
      return [power, clock, network]
    if (story.layer === "page" && story.name.startsWith("Home")) {
      return [
        {
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
        },
        power,
        clock,
        network,
      ]
    }
    return []
  },
  makeSeedInitialValues,
  makeSeedInitialValuesForBinding,
  mountSurface: (host, { initialValues, history, dualScreen, onRegistry }) =>
    mountShift(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
      dualScreen,
      onRegistry,
    }),
}
