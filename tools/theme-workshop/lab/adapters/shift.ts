import { shiftConfig } from "@product/surfaces/web/shift/config"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { SHIFT_COMPANION_PATH } from "@product/surfaces/web/shift/routes/paths"
import { DEFAULT_SHIFT_CLOCK_ISO } from "@product/surfaces/web/shift/shift-clock-state"
import { FOREGROUND_SESSION_GATE_STATE_TAGS } from "@product/surfaces/web/shift/shift-foreground-preview"
import type { RouterHistory } from "@tanstack/history"
import {
  makeSeedInitialValues,
  makeSeedInitialValuesForBinding,
  type SeedInitialValues,
  shiftLabSources,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "../surface-registry"
import { shiftAxesForScreen, shiftCaptureCoordinate } from "./shift-axes"
import {
  renderShiftSurfacePart,
  SHIFT_CLOCK_INPUT_ID,
  SHIFT_CLOCK_OPTIONS,
  SHIFT_NETWORK_INPUT_ID,
  SHIFT_NETWORK_STATE_OPTIONS,
  SHIFT_POWER_INPUT_ID,
  SHIFT_POWER_STATE_OPTIONS,
} from "./shift-surface-part"

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
    const power = {
      id: SHIFT_POWER_INPUT_ID,
      label: "Power",
      defaultValue: "Medium",
      options: SHIFT_POWER_STATE_OPTIONS,
    }
    const clock = {
      id: SHIFT_CLOCK_INPUT_ID,
      label: "Clock",
      defaultValue: DEFAULT_SHIFT_CLOCK_ISO,
      options: SHIFT_CLOCK_OPTIONS,
      control: { kind: "iso-datetime" as const },
    }
    const network = {
      id: SHIFT_NETWORK_INPUT_ID,
      label: "Network",
      defaultValue: "Connected",
      options: SHIFT_NETWORK_STATE_OPTIONS,
    }
    if (story.layer === "atom" && story.name === "Battery") return [power]
    if (story.layer === "molecule" && story.name === "Status Bar")
      return [power, clock, network]
    if (story.layer === "page" && story.name.startsWith("Home")) {
      return [
        {
          id: "foreground",
          label: "Foreground",
          defaultValue: "Ready",
          options: FOREGROUND_SESSION_GATE_STATE_TAGS.map(tag => ({
            id: tag,
            label: tag,
          })),
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
