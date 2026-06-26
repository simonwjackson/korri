import type { LabStateOption } from "../model/lab-source-state"
import { LAB_BIND_MIME } from "./LabSourcesPanel"

export function LabStatesPanel({
  states,
  activeId,
  onSelect,
}: {
  readonly states: readonly LabStateOption[]
  readonly activeId: string
  readonly onSelect: (id: LabStateOption["id"]) => void
}) {
  return (
    <div className="lab-panel-stack">
      <div className="lab-panel-hint">What the loader is doing. Drag onto a preview, or use its menu.</div>
      {states.map(state => (
        <div
          key={state.id}
          className={`lab-bind-row${activeId === state.id ? " is-on" : ""}`}
          draggable
          onClick={() => onSelect(state.id)}
          onDragStart={event => {
            event.dataTransfer.setData(LAB_BIND_MIME, `state:${state.id}`)
            event.dataTransfer.effectAllowed = "copy"
          }}
        >
          <span className={`lab-state-dot is-${state.id}`} aria-hidden />
          <strong>{state.label}</strong>
          {state.description ? <small>{state.description}</small> : null}
        </div>
      ))}
    </div>
  )
}
