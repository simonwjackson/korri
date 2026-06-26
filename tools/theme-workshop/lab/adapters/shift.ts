import { LaunchState } from "@platform/library/launch-state"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import { shiftConfig } from "@product/surfaces/web/shift/config"
import { mountShift } from "@product/surfaces/web/shift/mount-shift"
import { setShiftCatalogPreview } from "@product/surfaces/web/shift/shift-catalog-preview"
import { shiftCatalogStateSamples } from "@product/surfaces/web/shift/shift-catalog-state-samples"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "@product/surfaces/web/shift/shift-launch-preview"
import type { RouterHistory } from "@tanstack/history"
import { axisOptionsFromTags, type LabStateAxis } from "../model/lab-state-axis"
import {
  makeSeedInitialValues,
  type SeedInitialValues,
} from "../seed/shift-seed"
import type { LabSurfaceAdapter } from "../surface-registry"

// Shift Home's two orthogonal-but-nested state machines, surfaced as axes wired
// to the production-inert preview singletons the live routes consult.
const shiftDataAxis: LabStateAxis = {
  id: "data",
  label: "Data",
  liveLabel: "Live",
  states: axisOptionsFromTags(ShiftCatalogState.tags),
  pin: tag =>
    setShiftCatalogPreview(
      shiftCatalogStateSamples[tag as ShiftCatalogState["_tag"]](),
    ),
  release: () => setShiftCatalogPreview(null),
}

const shiftLaunchAxis: LabStateAxis = {
  id: "launch",
  label: "Launch",
  liveLabel: "Live",
  states: axisOptionsFromTags(LaunchState.tags),
  pin: tag =>
    setShiftLaunchPreview(launchStateSamples[tag as LaunchState["_tag"]]()),
  release: () => setShiftLaunchPreview(null),
  // The cinematic home (and its launch overlay) only exists in the Ready body.
  enabledWhen: active => active.data === "Ready",
  disabledHint: "Only while Data = Ready",
}

function shiftAxesForScreen(screenPath: string): readonly LabStateAxis[] {
  return screenPath === "/" ? [shiftDataAxis, shiftLaunchAxis] : []
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
  axesForScreen: shiftAxesForScreen,
  // Shift's Data + Launch state machines are surfaced as the Home screen's axes
  // (see shiftAxesForScreen) — not duplicated here as a control.
  makeSeedInitialValues,
  mountSurface: (host, { initialValues, history }) =>
    mountShift(host, {
      data: { initialValues: initialValues as SeedInitialValues },
      navigation: history ? { history: history as RouterHistory } : undefined,
    }),
}
