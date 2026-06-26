import { useLab } from "../Lab.context"

const ACCENTS = ["#7dd3fc", "#c4b5fd", "#fca5a5", "#86efac", "#fcd34d"]

export function LabInspectorPanel({
  accent,
  onAccent,
}: {
  readonly accent: string
  readonly onAccent: (value: string) => void
}) {
  const { adapter, knobValues, calibration } = useLab()
  const knobs = adapter.knobs ?? []
  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">Whole canvas</div>
      {knobs.length === 0 ? <div className="pt-sources-hint">No theme knobs for this surface.</div> : null}
      {knobs.map(knob => (
        <label key={knob.id} className="pt-knob">
          <div className="pt-knob-row">
            <span>{knob.label}</span>
            <span className="pt-knob-val">{knobValues[knob.cssVar] ?? knob.default}{knob.unit ?? ""}</span>
          </div>
          <input
            type="range"
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={knobValues[knob.cssVar] ?? knob.default}
            onChange={event => calibration.setKnob(knob.cssVar, Number(event.target.value))}
          />
        </label>
      ))}
      <div className="pt-swatches">
        {ACCENTS.map(color => (
          <button
            key={color}
            type="button"
            className={`pt-swatch${accent === color ? " is-on" : ""}`}
            style={{ background: color }}
            onClick={() => onAccent(color)}
            aria-label={`Accent ${color}`}
          />
        ))}
      </div>
    </div>
  )
}
