import { useLab } from "../Lab.context"

function idsForSelection(
  selection: ReturnType<typeof useLab>["selection"],
  deviceIds: readonly string[],
): readonly string[] {
  if (selection.kind === "all") return deviceIds
  const valid = new Set(deviceIds)
  return selection.ids.filter(id => valid.has(id))
}

function segmentForIds(ids: readonly string[], deviceIds: readonly string[]) {
  if (ids.length === 0 || ids.length === deviceIds.length) return "all"
  return ids.join(",")
}

export function LabDevicePicker() {
  const { devices, selection, setDevicesSegment } = useLab()
  const deviceIds = devices.map(device => device.id)
  const selectedIds = idsForSelection(selection, deviceIds)
  const selected = new Set(selectedIds)

  const toggleDevice = (deviceId: string) => {
    const next = new Set(selectedIds)
    if (next.has(deviceId)) next.delete(deviceId)
    else next.add(deviceId)
    const ordered = deviceIds.filter(id => next.has(id))
    setDevicesSegment(segmentForIds(ordered, deviceIds))
  }

  return (
    <div className="pt-device-picker">
      <div className="pt-tree-hint">
        Toggle live device objects on the workspace.
      </div>
      <button
        type="button"
        className={`pt-tree-layer${selectedIds.length === deviceIds.length ? " is-sel" : ""}`}
        aria-label="All live devices"
        aria-pressed={selectedIds.length === deviceIds.length}
        onClick={() => setDevicesSegment("all")}
      >
        <span>All live devices</span>
        <span className="pt-tree-layer-all">{devices.length}</span>
      </button>
      <ul className="pt-tree pt-device-list" aria-label="Live devices">
        {devices.map(device => {
          const active = selected.has(device.id)
          return (
            <li key={device.id}>
              <button
                type="button"
                className={`pt-tree-item${active ? " is-sel" : ""}`}
                aria-label={device.name}
                aria-pressed={active}
                onClick={() => toggleDevice(device.id)}
              >
                <span className="pt-tree-check">{active ? "●" : "○"}</span>
                <span className="pt-tree-name">{device.name}</span>
                <span className="pt-tree-meta">
                  {Math.round(device.widthMm)}×{Math.round(device.heightMm)}mm
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
