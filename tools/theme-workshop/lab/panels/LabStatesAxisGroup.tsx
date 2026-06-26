import {
  axisEnabled,
  isAxisLive,
  type LabAxisActiveMap,
  type LabStateAxis,
} from "../model/lab-state-axis"

/** One state axis rendered as a group: an Auto chip plus its states, greyed
 * with a reason when its nesting (`enabledWhen`) is not satisfied. */
export function LabStatesAxisGroup({
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
