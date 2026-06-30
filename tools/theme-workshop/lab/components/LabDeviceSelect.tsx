import { useLab } from "../Lab.context"
import {
  type DeviceSelection,
  deviceSegmentForSelection,
} from "../lab-route-state"

/**
 * Lightweight top-bar device selector. Picks which device(s) the canvas previews
 * without exposing screen sizes/calibration — that setup lives in the Settings
 * modal. "All" maps to the `all` segment; device chips multi-select. Rendered as
 * a `pt-seg` segmented control so it stays visible on compact/touch.
 */
export function LabDeviceSelect() {
  const { devices, selection, setDevicesSegment } = useLab()
  const selected =
    selection.kind === "all"
      ? new Set(devices.map(device => device.id))
      : new Set(selection.ids)

  const toggleDevice = (id: string) => {
    if (selection.kind === "all") {
      setDevicesSegment(id)
      return
    }
    const next = new Set(selection.ids)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const orderedIds = devices
      .map(device => device.id)
      .filter(deviceId => next.has(deviceId))
    const nextSelection: DeviceSelection =
      orderedIds.length === 0
        ? { kind: "all" }
        : { kind: "set", ids: orderedIds }
    setDevicesSegment(
      deviceSegmentForSelection(
        nextSelection,
        devices.map(device => device.id),
      ),
    )
  }

  return (
    <div
      className="pt-seg pt-seg-sm"
      role="toolbar"
      aria-label="Device selection"
    >
      <button
        type="button"
        aria-pressed={selection.kind === "all"}
        className={`pt-seg-btn${selection.kind === "all" ? " is-on" : ""}`}
        onClick={() => setDevicesSegment("all")}
      >
        All
      </button>
      {devices.map(device => (
        <button
          key={device.id}
          type="button"
          aria-pressed={selected.has(device.id)}
          className={`pt-seg-btn${
            selection.kind !== "all" && selected.has(device.id) ? " is-on" : ""
          }`}
          onClick={() => toggleDevice(device.id)}
        >
          {device.name}
        </button>
      ))}
    </div>
  )
}
