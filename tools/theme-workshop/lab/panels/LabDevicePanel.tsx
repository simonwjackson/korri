import { LabDevicePicker } from "../components/LabDevicePicker"

/** Lists live device objects that can appear together on the workspace. */
export function LabDevicePanel() {
  return (
    <div className="pt-device-panel">
      <LabDevicePicker />
    </div>
  )
}
