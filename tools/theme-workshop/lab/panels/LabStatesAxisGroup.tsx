import {
  axisEnabled,
  isAxisLive,
  type LabAxisActive,
  type LabScreenActive,
  type LabStateAxis,
} from "../model/lab-state-axis"

function stateIsOn(
  axis: LabStateAxis,
  active: LabAxisActive | undefined,
  stateId: string,
) {
  if (!active) return false
  if (axis.kind === "multi")
    return active.kind === "multi" && active.on.has(stateId)
  return active.kind === "single" && active.value === stateId
}

/** One state axis rendered as a group: an Auto chip plus its states. Single axes
 * are radio-like choices; multi axes are checkbox-like toggles. */
export function LabStatesAxisGroup({
  axis,
  active,
  onPin,
  onLive,
}: {
  readonly axis: LabStateAxis
  readonly active: LabScreenActive
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
        {axis.states.map(state => {
          const on = stateIsOn(axis, value, state.id)
          const multiProps =
            axis.kind === "multi"
              ? ({ role: "checkbox", "aria-checked": on } as const)
              : ({ "aria-pressed": on } as const)
          return (
            <button
              key={state.id}
              type="button"
              className={`pt-axis-chip${on ? " is-on" : ""}`}
              disabled={!enabled}
              onClick={() => onPin(axis.id, state.id)}
              {...multiProps}
            >
              <span
                className={`pt-state-dot is-${state.id.toLowerCase()}`}
                aria-hidden
              />
              {state.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
