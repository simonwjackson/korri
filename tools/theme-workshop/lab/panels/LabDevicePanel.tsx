import { LabDeviceSelect } from "../components/LabDeviceSelect"
import { LabSurfaceSelect } from "../components/LabSurfaceSelect"

/**
 * Panel housing the Device and Surface selectors. Moved out of the top-bar
 * control cluster so the canvas chrome stays minimal; the same self-contained
 * selects render here unchanged, stacked full-width.
 */
export function LabDevicePanel() {
  return (
    <div className="pt-device-panel">
      <LabSurfaceSelect />
      <LabDeviceSelect />
    </div>
  )
}
