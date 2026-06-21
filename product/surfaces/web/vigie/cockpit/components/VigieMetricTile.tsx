import type { DeviceMetric } from "../VigieCockpit.context"
import { VigieSparkline } from "./VigieSparkline"

// Molecule — one instrument: label, large tabular value, and a filled trace.

export function VigieMetricTile({ metric }: { readonly metric: DeviceMetric }) {
  return (
    <div className="vigie-instrument" data-status={metric.status}>
      <div className="vigie-instrument-head">
        <span className="vigie-instrument-label">{metric.label}</span>
        <span className="vigie-instrument-value">
          {metric.value}
          <span className="vigie-instrument-unit">{metric.unit}</span>
        </span>
      </div>
      <VigieSparkline series={metric.series} status={metric.status} />
    </div>
  )
}
