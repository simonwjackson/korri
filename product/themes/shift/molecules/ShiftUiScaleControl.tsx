import {
  clampUiScale,
  DEFAULT_UI_SCALE,
  formatUiScalePercent,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  parseUiScale,
  UI_SCALE_STEP,
} from "@platform/react/primitives/theme/ui-scale"
import { useId } from "react"

export interface ShiftUiScaleControlProps {
  readonly value: number
  readonly onChange: (scale: number) => void
  readonly onReset?: () => void
}

export function ShiftUiScaleControl({
  value,
  onChange,
  onReset,
}: ShiftUiScaleControlProps) {
  const id = useId()
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`
  const scale = clampUiScale(value)

  return (
    <section className="shift-labs-control-row" aria-labelledby={labelId}>
      <div className="shift-labs-control-copy">
        <h3 id={labelId} className="shift-labs-control-title">
          UI scale
        </h3>
        <p id={descriptionId} className="shift-labs-control-description">
          Resize the kiosk surface in realtime for this session.
        </p>
      </div>
      <div className="shift-labs-scale-control">
        <input
          id={id}
          type="range"
          min={MIN_UI_SCALE}
          max={MAX_UI_SCALE}
          step={UI_SCALE_STEP}
          value={scale}
          onChange={event => onChange(parseUiScale(event.currentTarget.value))}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          className="shift-labs-slider"
        />
        <output htmlFor={id} className="shift-labs-scale-value">
          {formatUiScalePercent(scale)}
        </output>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            disabled={scale === DEFAULT_UI_SCALE}
            className="shift-labs-reset-button"
          >
            Reset
          </button>
        ) : null}
      </div>
    </section>
  )
}
