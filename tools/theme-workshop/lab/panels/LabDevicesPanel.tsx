import { useLab } from "../Lab.context"

export function LabDevicesPanel() {
  const { devices, selectedDevices, pxPerMm, selection, setDevicesSegment, calibration } = useLab()
  const selected = new Set(selectedDevices.map(device => device.id))
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDevicesSegment(next.size === devices.length || next.size === 0 ? "all" : [...next].join(","))
  }
  return (
    <div className="pt-devices">
      <div className="pt-sources-hint">Physical-size device previews. Current selection: {selection.kind}</div>
      {devices.map(device => (
        <div key={device.id} className="lab-device-card">
          <button type="button" className={`pt-device${selected.has(device.id) ? " is-on" : ""}`} onClick={() => toggle(device.id)}>
            <span className="pt-device-check" aria-hidden>{selected.has(device.id) ? "●" : "○"}</span>
            {device.name}
          </button>
          <div className="lab-mm-fields">
            <label>W <input type="number" value={device.widthMm} onChange={event => calibration.patchDevice(device.id, { widthMm: Number(event.target.value) })} /></label>
            <label>H <input type="number" value={device.heightMm} onChange={event => calibration.patchDevice(device.id, { heightMm: Number(event.target.value) })} /></label>
          </div>
        </div>
      ))}
      <label className="pt-knob">
        <div className="pt-knob-row"><span>Scale</span><span className="pt-knob-val">{Math.round(pxPerMm * 25.4)}dpi</span></div>
        <input type="range" min={2.5} max={9} step={0.01} value={pxPerMm} onChange={event => calibration.setPxPerMm(Number(event.target.value))} />
      </label>
      <div className="lab-panel-actions">
        <button type="button" onClick={calibration.addDevice}>+ add device</button>
        <button type="button" onClick={calibration.reset}>Reset</button>
      </div>
    </div>
  )
}
