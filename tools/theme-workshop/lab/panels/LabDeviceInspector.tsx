import { Fragment, type ReactNode } from "react"
import { LabInputControlField } from "../components/LabInputControlField"
import type { LabInputValue } from "../model/lab-source-state"
import {
  axisEnabled,
  isAxisLive,
  LAB_AXIS_LIVE,
  type LabScreenActive,
  type LabStateAxis,
} from "../model/lab-state-axis"
import type { LabSurfaceEvent, LabSurfacePartInput } from "../surface-registry"
import { LabDeviceEvents } from "./LabDeviceEvents"
import { LabStatesAxisGroup } from "./LabStatesAxisGroup"

function childrenFor(
  axes: readonly LabStateAxis[],
  parentId: string,
): readonly LabStateAxis[] {
  return axes.filter(axis => axis.parent?.axisId === parentId)
}

/** One single-choice axis as a dropdown (Auto/Live plus its states). */
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
 * Inspector scoped to a selected live device object: shared live state-machine
 * axes plus product inputs that the mounted screen consumes (power, clock,
 * network, etc.).
 */
export function LabDeviceInspector({
  axes,
  activeByAxis,
  inputs,
  inputValues,
  events = [],
  onInputChange,
  onEmitEvent,
  onPin,
  onLive,
  onPinCurrent,
}: {
  readonly axes: readonly LabStateAxis[]
  readonly activeByAxis: LabScreenActive
  readonly inputs: readonly LabSurfacePartInput[]
  readonly inputValues: Readonly<Record<string, LabInputValue>>
  readonly events?: readonly LabSurfaceEvent[]
  readonly onInputChange: (inputId: string, value: LabInputValue) => void
  readonly onEmitEvent?: (eventId: string, payload: LabInputValue) => void
  readonly onPin: (axisId: string, stateId: string) => void
  readonly onLive: (axisId: string) => void
  /** Capture the running surface's current coordinate as Inspect pins. */
  readonly onPinCurrent?: () => void
}) {
  const regions = axes.filter(axis => !axis.parent)
  const hasEvents = events.length > 0 && Boolean(onEmitEvent)
  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">Selected live device</div>
      {regions.length === 0 && inputs.length === 0 && !hasEvents ? (
        <div className="pt-sources-hint">
          This surface's screen exposes no live controls.
        </div>
      ) : (
        <div className="pt-bind">
          {onPinCurrent && regions.length > 0 ? (
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
          {inputs.map(input => (
            <LabInputControlField
              key={input.id}
              label={input.label}
              value={inputValues[input.id]}
              defaultValue={input.defaultValue}
              control={input.control}
              ariaLabel={input.label}
              onChange={value => onInputChange(input.id, value)}
            />
          ))}
          {hasEvents && onEmitEvent ? (
            <LabDeviceEvents events={events} onEmit={onEmitEvent} />
          ) : null}
        </div>
      )}
    </div>
  )
}
