import { RotateCcw } from "lucide-react"
import { useLab } from "../Lab.context"

export function LabInspectorPanel() {
  const { adapter, knobValues, calibration } = useLab()
  const knobs = adapter.knobs ?? []
  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">Whole canvas</div>
      {knobs.length === 0 ? (
        <div className="pt-sources-hint">No theme knobs for this surface.</div>
      ) : null}
      {knobs.map(knob => {
        const value = knobValues[knob.cssVar] ?? knob.default
        const changed = value !== knob.default
        return (
          <div key={knob.id} className="pt-knob">
            <div className="pt-knob-row">
              <span>{knob.label}</span>
              <span className="pt-knob-value-group">
                <span className="pt-knob-val">
                  {value}
                  {knob.unit ?? ""}
                </span>
                {changed ? (
                  <button
                    type="button"
                    className="pt-knob-reset"
                    aria-label={`Reset ${knob.label}`}
                    onClick={() =>
                      calibration.setKnob(knob.cssVar, knob.default)
                    }
                  >
                    <RotateCcw aria-hidden size={13} strokeWidth={2.2} />
                  </button>
                ) : null}
              </span>
            </div>
            <input
              type="range"
              aria-label={knob.label}
              min={knob.min}
              max={knob.max}
              step={knob.step}
              value={value}
              onChange={event =>
                calibration.setKnob(knob.cssVar, Number(event.target.value))
              }
            />
          </div>
        )
      })}
    </div>
  )
}
