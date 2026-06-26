import type { LabStateOption } from "../model/lab-source-state"
import { LAB_BIND_MIME } from "./LabSourcesPanel"

export function LabStatesPanel({
  states,
  activeId,
  onSelect,
  hasSelection = false,
}: {
  readonly states: readonly LabStateOption[]
  readonly activeId: string
  readonly onSelect: (id: LabStateOption["id"]) => void
  readonly hasSelection?: boolean
}) {
  if (states.length === 0) {
    return (
      <div className="pt-sources">
        <div className="pt-sources-hint">
          {hasSelection
            ? "This part has a single state."
            : "This surface has no parts with multiple states."}
        </div>
      </div>
    )
  }
  return (
    <div className="pt-sources">
      <div className="pt-sources-hint">
        This part's states, from its own state machine. <b>Drag</b> onto an object or tap to make it active.
      </div>
      {states.map(state => (
        <div
          key={state.id}
          className={`pt-source-row${activeId === state.id ? " is-on" : ""}`}
          draggable
          onClick={() => onSelect(state.id)}
          onDragStart={event => {
            event.dataTransfer.setData(LAB_BIND_MIME, `state:${state.id}`)
            event.dataTransfer.effectAllowed = "copy"
          }}
        >
          <span className="pt-source-grip" aria-hidden>⠇</span>
          <span className={`pt-state-dot is-${state.id.toLowerCase()}`} aria-hidden />
          <span className="pt-source-label">{state.label}</span>
        </div>
      ))}
    </div>
  )
}
