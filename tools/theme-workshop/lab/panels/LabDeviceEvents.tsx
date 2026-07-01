import { useState } from "react"
import { LabInputControlField } from "../components/LabInputControlField"
import {
  canonicalInputValue,
  type LabInputValue,
} from "../model/lab-source-state"
import type { LabSurfaceEvent } from "../surface-registry"

/**
 * One device event as an editable payload plus a Send action. Unlike an input
 * (which pins a held value), an event is fire-and-observe: the draft payload is
 * local, and pressing Send dispatches one discrete event into the live surface.
 */
function LabDeviceEventRow({
  event,
  onEmit,
}: {
  readonly event: LabSurfaceEvent
  readonly onEmit: (eventId: string, payload: LabInputValue) => void
}) {
  const [draft, setDraft] = useState<LabInputValue>(() =>
    canonicalInputValue(
      event.defaultPayload,
      event.payload,
      event.defaultPayload,
    ),
  )
  return (
    <div className="pt-event-row">
      <LabInputControlField
        label={event.label}
        value={draft}
        defaultValue={event.defaultPayload}
        control={event.payload}
        ariaLabel={`${event.label} event payload`}
        onChange={next =>
          setDraft(
            canonicalInputValue(next, event.payload, event.defaultPayload),
          )
        }
      />
      <button
        type="button"
        className="pt-event-send"
        aria-label={`Send ${event.label} event`}
        onClick={() => onEmit(event.id, draft)}
      >
        Send
      </button>
    </div>
  )
}

/** Events section for the selected live device: each surface event gets a
 * payload editor and a Send button. */
export function LabDeviceEvents({
  events,
  onEmit,
}: {
  readonly events: readonly LabSurfaceEvent[]
  readonly onEmit: (eventId: string, payload: LabInputValue) => void
}) {
  if (events.length === 0) return null
  return (
    <div className="pt-events">
      <div className="pt-events-title">Events</div>
      {events.map(event => (
        <LabDeviceEventRow key={event.id} event={event} onEmit={onEmit} />
      ))}
    </div>
  )
}
