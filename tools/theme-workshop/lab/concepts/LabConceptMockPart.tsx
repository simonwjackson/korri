import { BatteryLow, Wifi, WifiOff, Zap } from "lucide-react"
import type { LabConceptVariant } from "./lab-concept-model"

/** A stand-in "part" the concept prototypes talk to. It reacts to the chosen
 * variant so swapping a variant visibly changes the thing under the controls —
 * the whole point of colocation. This is a mock, not a real Shift part. */
export function LabConceptMockPart({
  variant,
}: {
  readonly variant: LabConceptVariant
}) {
  return (
    <div className={`lab-cpart lab-cpart--${variant.density}`}>
      <div className="lab-cpart-status">
        <span className="lab-cpart-clock">{variant.clock}</span>
        <span className="lab-cpart-meta">
          {variant.online ? (
            <Wifi size={14} aria-hidden />
          ) : (
            <WifiOff size={14} aria-hidden />
          )}
          <span className="lab-cpart-batt">
            {variant.charging ? (
              <Zap size={13} aria-hidden />
            ) : variant.battery <= 20 ? (
              <BatteryLow size={15} aria-hidden />
            ) : null}
            {variant.battery}%
          </span>
        </span>
      </div>
      <div className="lab-cpart-body">
        <div className="lab-cpart-kicker">Continue playing</div>
        <div className="lab-cpart-title">Hollow Knight</div>
        <div className="lab-cpart-sub">Hornet · 62% · 14h played</div>
      </div>
      <div className="lab-cpart-chips">
        <span className="lab-cpart-chip is-primary">Resume</span>
        <span className="lab-cpart-chip">Details</span>
        <span className="lab-cpart-chip">Favorite</span>
      </div>
    </div>
  )
}
