import {
  deviceSegmentForSelection,
  type DeviceSelection,
} from "../lab-route-state"
import { useLab } from "../Lab.context"

export function LabDevicePicker() {
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
    <div className="lab-focus" aria-label="Device selection">
      <button
        type="button"
        className={cx(
          "lab-focus-tab",
          selection.kind === "all" ? "on" : undefined,
        )}
        aria-pressed={selection.kind === "all"}
        onClick={() => setDevicesSegment("all")}
      >
        ALL
      </button>
      {devices.map(device => (
        <button
          key={device.id}
          type="button"
          className={cx(
            "lab-focus-tab",
            selected.has(device.id) ? "on" : undefined,
          )}
          aria-pressed={selected.has(device.id)}
          onClick={() => toggleDevice(device.id)}
        >
          {device.name}
        </button>
      ))}
    </div>
  )
}

const cx = (...classes: readonly (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")
