import {
  PICO_DATA_TAGS,
  picoDataStateSamples,
  setPicoDataPreview,
} from "@product/surfaces/web/pico/pico-data-preview"
import {
  axisOptionsFromTags,
  type LabStateAxis,
  pinFromTable,
} from "../model/lab-state-axis"

// Pico's catalog Data axis — the same model as Shift Home, minus Launch. The
// pin drives the pico-data preview singleton the live routes consult.
const picoDataAxis: LabStateAxis = {
  id: "data",
  kind: "single",
  label: "Data",
  liveLabel: "Auto",
  states: axisOptionsFromTags([...PICO_DATA_TAGS]),
  pin: pinFromTable(picoDataStateSamples, setPicoDataPreview),
  release: () => setPicoDataPreview(null),
}

export function picoAxesForScreen(screenPath: string): readonly LabStateAxis[] {
  return screenPath === "/" ? [picoDataAxis] : []
}
