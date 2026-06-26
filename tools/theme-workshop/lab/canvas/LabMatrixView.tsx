import type { DeviceConfig } from "../../device-lab"
import type { Story } from "../../types"
import type { LabSourceOption, LabStateOption } from "../model/lab-source-state"
import type { LabStateAxis } from "../model/lab-state-axis"
import { LabAxisMatrix } from "./LabAxisMatrix"
import { LabPartsMatrix } from "./LabPartsMatrix"

/** Matrix view: fan a screen's state axis (axis mode) or lay out discovered
 * parts across parts/sources/states/devices (legacy mode). */
export function LabMatrixView({
  selectedStories,
  stories,
  sources,
  states,
  devices,
  axes,
}: {
  readonly selectedStories: readonly Story[]
  readonly stories: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly devices: readonly DeviceConfig[]
  readonly axes?: readonly LabStateAxis[]
}) {
  if (axes && axes.length > 0) return <LabAxisMatrix axes={axes} />
  return (
    <LabPartsMatrix
      selectedStories={selectedStories}
      stories={stories}
      sources={sources}
      states={states}
      devices={devices}
    />
  )
}
