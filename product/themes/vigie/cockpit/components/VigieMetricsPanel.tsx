import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { useVigieCockpit } from "../VigieCockpit.context"
import { VigieMetricTile } from "./VigieMetricTile"

// Tier 2 — device telemetry strip on shadcn Card. GPU/CPU/MEM/SoC instruments
// (the traces themselves have no shadcn equivalent) plus the governor control.

export function VigieMetricsPanel() {
  const { metrics, governor, setGovernor } = useVigieCockpit()

  return (
    <Card className="vigie-card" aria-label="Device telemetry">
      <CardHeader>
        <CardTitle className="vigie-section-title">Device telemetry</CardTitle>
        <CardAction>
          <label className="vigie-governor">
            <span>Governor</span>
            <select
              value={governor.current}
              onChange={event => setGovernor(event.currentTarget.value)}
            >
              {governor.options.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="vigie-telemetry-grid">
          {metrics.map(metric => (
            <VigieMetricTile key={metric.id} metric={metric} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
