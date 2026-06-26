import { RegistryProvider } from "@effect/atom-react"
import { LaunchState } from "@platform/library/launch-state"
import { ShiftCatalogState } from "@product/surfaces/web/shift/catalog/shift-catalog-state"
import { SHIFT_CINEMATIC_GAMES } from "@product/surfaces/web/shift/config"
import { ShiftCinematicHome } from "@product/surfaces/web/shift/pages/ShiftCinematicHome"
import { ShiftHomeStateView } from "@product/surfaces/web/shift/routes/ShiftHomeRoute"
import { setShiftCatalogPreview } from "@product/surfaces/web/shift/shift-catalog-preview"
import { shiftCatalogStateSamples } from "@product/surfaces/web/shift/shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "@product/surfaces/web/shift/shift-current-coordinate"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "@product/surfaces/web/shift/shift-launch-preview"
import {
  axisOptionsFromTags,
  LAB_AXIS_LIVE,
  type LabAxisActiveMap,
  type LabStateAxis,
  pinFromTable,
  renderFromTable,
} from "../model/lab-state-axis"

// Shift Home's two orthogonal-but-nested state machines, surfaced as axes wired
// to the production-inert preview singletons the live routes consult. The
// `renderSample` seeds feed the same sample tables straight into the real views,
// so the Matrix fan-out and the live pin can never disagree.

const shiftDataAxis: LabStateAxis = {
  id: "data",
  label: "Data",
  liveLabel: "Auto",
  states: axisOptionsFromTags(ShiftCatalogState.tags),
  pin: pinFromTable(shiftCatalogStateSamples, setShiftCatalogPreview),
  release: () => setShiftCatalogPreview(null),
  renderSample: renderFromTable(shiftCatalogStateSamples, result => (
    <RegistryProvider>
      <ShiftHomeStateView result={result} />
    </RegistryProvider>
  )),
}

const shiftLaunchAxis: LabStateAxis = {
  id: "launch",
  label: "Launch",
  liveLabel: "Auto",
  states: axisOptionsFromTags(LaunchState.tags),
  pin: pinFromTable(launchStateSamples, setShiftLaunchPreview),
  release: () => setShiftLaunchPreview(null),
  // The cinematic home (and its launch overlay) only exists in the Ready body.
  enabledWhen: active => active.data === "Ready",
  disabledHint: "Only while Data = Ready",
  renderSample: renderFromTable(launchStateSamples, launchState => (
    <ShiftCinematicHome
      games={SHIFT_CINEMATIC_GAMES}
      launchState={launchState}
    />
  )),
}

export function shiftAxesForScreen(
  screenPath: string,
): readonly LabStateAxis[] {
  return screenPath === "/" ? [shiftDataAxis, shiftLaunchAxis] : []
}

/** Capture the running surface's coordinate as per-axis pins. Launch maps to
 * Live unless Data is Ready (its nesting), so the captured pin round-trips. */
export function shiftCaptureCoordinate(screenPath: string): LabAxisActiveMap {
  const coordinate = readShiftCurrentCoordinate(screenPath)
  return {
    data: coordinate.data,
    launch: coordinate.data === "Ready" ? coordinate.launch : LAB_AXIS_LIVE,
  }
}
