import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import type { DeviceMetric } from "../VigieCockpit.context"
import { VigieSparkline } from "./VigieSparkline"

// A full-size telemetry chart for the Telemetry page: large trace + value +
// min/avg/max footer.

export function VigieMetricChart({
  metric,
}: {
  readonly metric: DeviceMetric
}) {
  const min = Math.min(...metric.series)
  const max = Math.max(...metric.series)
  const avg = Math.round(
    metric.series.reduce((sum, value) => sum + value, 0) / metric.series.length,
  )

  return (
    <Card className="vigie-chart vigie-card" data-status={metric.status}>
      <CardHeader>
        <CardTitle className="vigie-section-title">{metric.label}</CardTitle>
        <CardAction>
          <span className="vigie-instrument-value">
            {metric.value}
            <span className="vigie-instrument-unit">{metric.unit}</span>
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <VigieSparkline series={metric.series} status={metric.status} />
        <dl className="vigie-chart-stats">
          <div>
            <dt>min</dt>
            <dd>
              {min}
              {metric.unit}
            </dd>
          </div>
          <div>
            <dt>avg</dt>
            <dd>
              {avg}
              {metric.unit}
            </dd>
          </div>
          <div>
            <dt>max</dt>
            <dd>
              {max}
              {metric.unit}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
