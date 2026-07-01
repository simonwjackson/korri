import { RotateCcw } from "lucide-react"
import { LabInputControlField } from "../components/LabInputControlField"
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
      <div className="pt-bind">
        {knobs.map(knob => {
          const value = knobValues[knob.cssVar] ?? knob.default
          const changed = value !== knob.default
          return (
            <LabInputControlField
              key={knob.id}
              label={knob.label}
              value={value}
              defaultValue={knob.default}
              control={{
                kind: "range",
                min: knob.min,
                max: knob.max,
                step: knob.step,
                unit: knob.unit,
              }}
              ariaLabel={knob.label}
              labelAction={
                changed ? (
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
                ) : null
              }
              onChange={next => calibration.setKnob(knob.cssVar, Number(next))}
            />
          )
        })}
      </div>
    </div>
  )
}
