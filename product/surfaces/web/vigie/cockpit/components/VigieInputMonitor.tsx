import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { useVigieCockpit } from "../VigieCockpit.context"

// Live input monitor — the "press something, watch it" panel. Semantic actions
// and raw button/axis events as they arrive.

export function VigieInputMonitor() {
  const { inputEvents } = useVigieCockpit()

  return (
    <Card className="h-full vigie-card" aria-label="Input monitor">
      <CardHeader>
        <CardTitle className="vigie-section-title">Live input</CardTitle>
        <CardAction>
          <span className="vigie-live-pip">
            <span className="vigie-state-pulse" aria-hidden="true" />
            streaming
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="vigie-input-stream">
          {inputEvents.map((event, index) => (
            <li
              key={`${event.ts}-${index}`}
              className="vigie-input-event"
              data-kind={event.kind}
            >
              <span className="vigie-input-ts">{event.ts}</span>
              <span className="vigie-input-kind">{event.kind}</span>
              <span className="vigie-input-label">{event.label}</span>
              {event.value ? (
                <span className="vigie-input-value">{event.value}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
