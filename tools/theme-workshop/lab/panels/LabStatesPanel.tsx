import type { LabStateOption } from "../model/lab-source-state"
import {
  axisEnabled,
  isAxisLive,
  type LabAxisActiveMap,
  type LabStateAxis,
} from "../model/lab-state-axis"
import { LAB_BIND_MIME } from "./LabSourcesPanel"

export function LabStatesPanel({
  axes,
  activeByAxis,
  onPin,
  onLive,
  onPinCurrent,
  states,
  activeId,
  onSelect,
  hasSelection = false,
}: {
  /** The active screen's state-machine axes. When present, the panel shows
   * grouped axis controls; otherwise it falls back to a part's flat states.
   * The axis handlers are required so axis controls can never render enabled but
   * inert; flat-only callers still pass them (the panel may render either mode). */
  readonly axes?: readonly LabStateAxis[]
  readonly activeByAxis: LabAxisActiveMap
  readonly onPin: (axisId: string, stateId: string) => void
  readonly onLive: (axisId: string) => void
  /** Capture the running surface's current coordinate as Inspect pins. */
  readonly onPinCurrent?: () => void
  readonly states: readonly LabStateOption[]
  readonly activeId: string
  readonly onSelect: (id: LabStateOption["id"]) => void
  readonly hasSelection?: boolean
}) {
  if (axes && axes.length > 0) {
    return (
      <div className="pt-sources">
        <div className="pt-sources-hint">
          Each axis is one of this screen's state machines. <b>Live</b> hands it
          to the running app; pick a state to pin it.
        </div>
        {onPinCurrent ? (
          <button
            type="button"
            className="pt-axis-pincurrent"
            onClick={onPinCurrent}
          >
            Pin current
          </button>
        ) : null}
        {axes.map(axis => (
          <LabStatesAxisGroup
            key={axis.id}
            axis={axis}
            active={activeByAxis}
            onPin={onPin}
            onLive={onLive}
          />
        ))}
      </div>
    )
  }

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
        This part's states, from its own state machine. <b>Drag</b> onto an
        object or tap to make it active.
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
          <span className="pt-source-grip" aria-hidden>
            ⠇
          </span>
          <span
            className={`pt-state-dot is-${state.id.toLowerCase()}`}
            aria-hidden
          />
          <span className="pt-source-label">{state.label}</span>
        </div>
      ))}
    </div>
  )
}

function LabStatesAxisGroup({
  axis,
  active,
  onPin,
  onLive,
}: {
  readonly axis: LabStateAxis
  readonly active: LabAxisActiveMap
  readonly onPin: (axisId: string, stateId: string) => void
  readonly onLive: (axisId: string) => void
}) {
  const enabled = axisEnabled(axis, active)
  const value = active[axis.id]
  return (
    <div className={`pt-axis-group${enabled ? "" : " is-disabled"}`}>
      <div className="pt-axis-head">
        <span className="pt-axis-label">{axis.label}</span>
        {!enabled && axis.disabledHint ? (
          <span className="pt-axis-reason">{axis.disabledHint}</span>
        ) : null}
      </div>
      <div className="pt-axis-rows">
        <button
          type="button"
          className={`pt-axis-chip is-live${isAxisLive(value) ? " is-on" : ""}`}
          disabled={!enabled}
          aria-pressed={isAxisLive(value)}
          onClick={() => onLive(axis.id)}
        >
          {axis.liveLabel}
        </button>
        {axis.states.map(state => (
          <button
            key={state.id}
            type="button"
            className={`pt-axis-chip${value === state.id ? " is-on" : ""}`}
            disabled={!enabled}
            aria-pressed={value === state.id}
            onClick={() => onPin(axis.id, state.id)}
          >
            <span
              className={`pt-state-dot is-${state.id.toLowerCase()}`}
              aria-hidden
            />
            {state.label}
          </button>
        ))}
      </div>
    </div>
  )
}
