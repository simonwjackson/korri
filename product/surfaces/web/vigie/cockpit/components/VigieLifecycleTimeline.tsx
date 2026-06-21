import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { useVigieCockpit } from "../VigieCockpit.context"

// Lifecycle event stream for the active session — phase transitions over time.

export function VigieLifecycleTimeline() {
  const { lifecycle } = useVigieCockpit()

  return (
    <Card className="h-full vigie-card" aria-label="Lifecycle">
      <CardHeader>
        <CardTitle className="vigie-section-title">Lifecycle</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="vigie-timeline">
          {lifecycle.map((event, index) => (
            <li
              key={`${event.ts}-${index}`}
              className="vigie-timeline-item"
              data-level={event.level ?? "info"}
            >
              <span className="vigie-timeline-dot" aria-hidden="true" />
              <div className="vigie-timeline-body">
                <div className="vigie-timeline-head">
                  <span className="vigie-timeline-phase">{event.phase}</span>
                  <span className="vigie-timeline-ts">{event.ts}</span>
                </div>
                <p className="vigie-timeline-detail">{event.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
