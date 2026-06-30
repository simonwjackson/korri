import { Fragment, type ReactNode } from "react"
import {
  axisEnabled,
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabScreenActive,
  type LabStateAxis,
} from "../model/lab-state-axis"
import { LabStatesAxisGroup } from "./LabStatesAxisGroup"

function childrenFor(
  axes: readonly LabStateAxis[],
  parentId: string,
): readonly LabStateAxis[] {
  return axes.filter(axis => axis.parent?.axisId === parentId)
}

/** One single-choice axis as a dropdown (Auto/Live plus its states), matching
 * the object-binding selects. Multi-select axes keep the chip group. */
function AxisControl({
  axis,
  active,
  onPin,
  onLive,
}: {
  readonly axis: LabStateAxis
  readonly active: LabScreenActive
  readonly onPin: (axisId: string, stateId: string) => void
  readonly onLive: (axisId: string) => void
}): ReactNode {
  const enabled = axisEnabled(axis, active)
  if (axis.kind === "multi")
    return (
      <LabStatesAxisGroup
        axis={axis}
        active={active}
        onPin={onPin}
        onLive={onLive}
      />
    )
  const value = active[axis.id]
  const current =
    !value || isAxisLive(value) || value.kind !== "single"
      ? LAB_AXIS_LIVE
      : value.value
  return (
    <label className="pt-bind-row">
      <span className="pt-bind-label">
        {axis.label}
        {!enabled && axis.disabledHint ? ` · ${axis.disabledHint}` : ""}
      </span>
      <select
        disabled={!enabled}
        value={current}
        aria-label={axis.label}
        onChange={event => {
          const next = event.target.value
          if (next === LAB_AXIS_LIVE) onLive(axis.id)
          else onPin(axis.id, next)
        }}
      >
        <option value={LAB_AXIS_LIVE}>{axis.liveLabel}</option>
        {axis.states.map(state => (
          <option key={state.id} value={state.id}>
            {state.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function AxisTree({
  axis,
  axes,
  active,
  onPin,
  onLive,
}: {
  readonly axis: LabStateAxis
  readonly axes: readonly LabStateAxis[]
  readonly active: LabScreenActive
  readonly onPin: (axisId: string, stateId: string) => void
  readonly onLive: (axisId: string) => void
}): ReactNode {
  const enabledChildren = childrenFor(axes, axis.id).filter(child =>
    axisEnabled(child, active),
  )
  return (
    <Fragment>
      <AxisControl axis={axis} active={active} onPin={onPin} onLive={onLive} />
      {enabledChildren.map(child => (
        <AxisTree
          key={child.id}
          axis={child}
          axes={axes}
          active={active}
          onPin={onPin}
          onLive={onLive}
        />
      ))}
    </Fragment>
  )
}

/**
 * Inspector scoped to the Device frame: the running surface's live state-machine
 * axes, each as a dropdown (Auto follows the running app; pick a state to pin
 * it) so it reads the same as the object bindings. Folded in from the old States
 * panel.
 */
export function LabDeviceInspector({
  axes,
  activeByAxis,
  onPin,
  onLive,
  onPinCurrent,
}: {
  readonly axes: readonly LabStateAxis[]
  readonly activeByAxis: LabScreenActive
  readonly onPin: (axisId: string, stateId: string) => void
  readonly onLive: (axisId: string) => void
  /** Capture the running surface's current coordinate as Inspect pins. */
  readonly onPinCurrent?: () => void
}) {
  const regions = axes.filter(axis => !axis.parent)
  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">Live axes</div>
      {regions.length === 0 ? (
        <div className="pt-sources-hint">
          This surface's screen exposes no live state machines.
        </div>
      ) : (
        <div className="pt-bind">
          {onPinCurrent ? (
            <button
              type="button"
              className="pt-axis-pincurrent"
              onClick={onPinCurrent}
            >
              Pin current
            </button>
          ) : null}
          {regions.map(region => (
            <AxisTree
              key={region.id}
              axis={region}
              axes={axes}
              active={activeByAxis}
              onPin={onPin}
              onLive={onLive}
            />
          ))}
        </div>
      )}
    </div>
  )
}
