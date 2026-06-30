import type { CSSProperties } from "react"
import { useLab } from "../Lab.context"

/** ISO ID-1 credit card, the physical reference for monitor calibration. */
const CARD_W_MM = 85.6
const CARD_H_MM = 53.98

/**
 * Credit-card DPI calibrator. Hold a real ISO ID-1 card (85.6 × 53.98 mm) to
 * the dashed outline and drag Scale until they match — this calibrates the
 * monitor's pixels-per-mm once so device frames render at true physical size.
 */
export function LabScaleCalibrator() {
  const { pxPerMm, calibration } = useLab()
  const dpi = Math.round(pxPerMm * 25.4)

  return (
    <div className="lab-scale-cal">
      <p className="lab-scale-cal-hint">
        Hold a real credit card against the dashed outline floating in the
        centre of the screen and drag Scale until they line up. The outline
        always renders at true size, so it may extend past this window.
        Calibrates this monitor once.
      </p>
      <label className="pt-knob">
        <div className="pt-knob-row">
          <span>Scale</span>
          <span className="pt-knob-val">{dpi}dpi</span>
        </div>
        <input
          type="range"
          min={2.5}
          max={9}
          step={0.01}
          value={pxPerMm}
          aria-label="Scale"
          onChange={event => calibration.setPxPerMm(Number(event.target.value))}
        />
      </label>
      <div
        className="lab-scale-cal-card"
        aria-hidden
        style={
          {
            width: CARD_W_MM * pxPerMm,
            height: CARD_H_MM * pxPerMm,
          } as CSSProperties
        }
      >
        match a credit card
      </div>
    </div>
  )
}
