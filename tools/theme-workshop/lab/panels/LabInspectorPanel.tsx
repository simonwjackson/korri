import { useLab } from "../Lab.context"

export function LabInspectorPanel() {
  const { adapter, knobValues, calibration } = useLab()
  const knobs = adapter.knobs ?? []
  if (knobs.length === 0) return <div className="lab-panel-hint">No theme knobs for this surface.</div>
  return (
    <div className="lab-panel-stack">
      {knobs.map(knob => (
        <label key={knob.id} className="lab-slider-row">
          <span>{knob.label}</span>
          <input
            type="range"
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={knobValues[knob.cssVar] ?? knob.default}
            onChange={event => calibration.setKnob(knob.cssVar, Number(event.target.value))}
          />
          <output>{knobValues[knob.cssVar] ?? knob.default}{knob.unit ?? ""}</output>
        </label>
      ))}
    </div>
  )
}
