import { useLab } from "../Lab.context"
import { deviceSegmentForSelection } from "../lab-route-state"

/**
 * Lightweight top-bar device selector. Picks which device the canvas previews
 * without exposing screen sizes/calibration — that setup lives in the Settings
 * modal. "All" maps to the `all` segment; individual devices map directly to
 * their route segment.
 */
export function LabDeviceSelect() {
  const { devices, selection, setDevicesSegment } = useLab()
  const deviceIds = devices.map(device => device.id)
  const currentValue = deviceSegmentForSelection(selection, deviceIds)
  const hasMultiDeviceSelection =
    selection.kind === "set" && selection.ids.length > 1

  return (
    <label className="pt-surface-select pt-device-select">
      Device
      <select
        aria-label="Device selection"
        value={currentValue}
        onChange={event => setDevicesSegment(event.currentTarget.value)}
      >
        <option value="all">All devices</option>
        {hasMultiDeviceSelection ? (
          <option value={currentValue}>{selection.ids.length} devices</option>
        ) : null}
        {devices.map(device => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>
    </label>
  )
}
