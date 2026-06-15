import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { VigieMetricChart } from "../components/VigieMetricChart"
import { useVigieCockpit } from "../VigieCockpit.context"

// Telemetry — device metrics in depth (full charts), the live stream pipeline,
// and power/governor control.

export function VigieTelemetryView() {
  const { metrics, governor, setGovernor, session } = useVigieCockpit()

  return (
    <main className="vigie-view">
      <div className="vigie-chart-grid">
        {metrics.map(metric => (
          <VigieMetricChart key={metric.id} metric={metric} />
        ))}
      </div>

      <div className="vigie-two-col">
        <Card className="vigie-card" aria-label="Stream pipeline">
          <CardHeader>
            <CardTitle className="vigie-section-title">
              Stream pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {session.stream.length > 0 ? (
              <dl className="vigie-readouts">
                {session.stream.map(readout => (
                  <div
                    key={readout.id}
                    className="vigie-readout"
                    data-accent={readout.accent ?? "none"}
                  >
                    <dt>{readout.label}</dt>
                    <dd>{readout.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="vigie-empty">No active stream.</p>
            )}
          </CardContent>
        </Card>

        <Card className="vigie-card" aria-label="Power">
          <CardHeader>
            <CardTitle className="vigie-section-title">Power</CardTitle>
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
            <dl className="vigie-readouts">
              <div className="vigie-readout">
                <dt>Profile</dt>
                <dd className="capitalize">{governor.current}</dd>
              </div>
              <div className="vigie-readout" data-accent="caution">
                <dt>SoC temp</dt>
                <dd>72°C</dd>
              </div>
              <div className="vigie-readout">
                <dt>Draw</dt>
                <dd>11.4 W</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
