import { Fragment, type ReactNode, useState } from "react"
import type { DeviceConfig } from "../../device-lab"
import type { Story } from "../../types"
import { stateVariantFor } from "../model/lab-part-model"
import type {
  LabSourceOption,
  LabStateOption,
  SourceStatus,
} from "../model/lab-source-state"
import { axisEnabled, type LabStateAxis } from "../model/lab-state-axis"
import { LabPartPreview } from "./LabPartPreview"

type Axis = "parts" | "sources" | "states" | "devices"
type AxisValue = {
  readonly id: string
  readonly label: string
  readonly ratio?: number
}

const ROW_NONE = "__none__"

export function LabMatrixView({
  selectedStories,
  stories,
  sources,
  states,
  devices,
  axes,
}: {
  readonly selectedStories: readonly Story[]
  readonly stories: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly devices: readonly DeviceConfig[]
  readonly axes?: readonly LabStateAxis[]
}) {
  if (axes && axes.length > 0) return <LabAxisMatrix axes={axes} />
  return (
    <LabPartsMatrix
      selectedStories={selectedStories}
      stories={stories}
      sources={sources}
      states={states}
      devices={devices}
    />
  )
}

/** Fan a screen's state-machine axis across the grid: every value side by side,
 * seeded and static. A second axis adds the cross-product, honoring nesting. */
function LabAxisMatrix({ axes }: { axes: readonly LabStateAxis[] }) {
  const [colId, setColId] = useState(axes[0]?.id ?? "")
  // Single axis by default — every value of the chosen axis side by side; pick a
  // second axis to add the cross-product.
  const [rowId, setRowId] = useState<string>(ROW_NONE)
  const colAxis = axes.find(axis => axis.id === colId) ?? axes[0]!
  // Guard against a stale/duplicate row selection (e.g. after switching columns
  // to the current row axis, or switching to a surface with fewer axes): a row
  // equal to the column would drop the cross coordinate and grey every cell.
  const rowAxis =
    rowId === ROW_NONE || rowId === colAxis.id
      ? null
      : (axes.find(a => a.id === rowId) ?? null)

  const selectColumn = (next: string) => {
    setColId(next)
    if (rowId === next) setRowId(ROW_NONE)
  }

  const colVals = colAxis.states
  const rowVals = rowAxis ? rowAxis.states : [{ id: "__single__", label: "" }]

  const cell = (rowVal: string, colVal: string): ReactNode => {
    if (rowAxis) {
      const active = { [rowAxis.id]: rowVal, [colAxis.id]: colVal }
      const dependent =
        [rowAxis, colAxis].find(axis => axis.enabledWhen) ?? null
      if (dependent && !axisEnabled(dependent, active)) {
        return (
          <div className="lab-empty-state">
            {dependent.disabledHint ?? "Not applicable"}
          </div>
        )
      }
      const render = dependent ?? colAxis
      return framed(render, render.id === colAxis.id ? colVal : rowVal)
    }
    return framed(colAxis, colVal)
  }

  return (
    <div className="pt-matrix-wrap">
      <div className="pt-matrix-axisbar">
        <label className="pt-matrix-axispick">
          Columns
          <select
            value={colId}
            onChange={event => selectColumn(event.target.value)}
          >
            {axes.map(axis => (
              <option key={axis.id} value={axis.id}>
                {axis.label}
              </option>
            ))}
          </select>
        </label>
        <span className="pt-matrix-axissep" />
        <label className="pt-matrix-axispick">
          Rows
          <select
            value={rowId}
            onChange={event => setRowId(event.target.value)}
          >
            <option value={ROW_NONE}>—</option>
            {axes
              .filter(axis => axis.id !== colId)
              .map(axis => (
                <option key={axis.id} value={axis.id}>
                  {axis.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="pt-matrix-scroll">
        <div
          className="pt-matrix"
          style={{
            gridTemplateColumns: `150px repeat(${colVals.length}, minmax(220px, 1fr))`,
          }}
        >
          <div className="pt-matrix-corner" />
          {colVals.map(col => (
            <div key={col.id} className="pt-matrix-colhead">
              {col.label}
            </div>
          ))}
          {rowVals.map(row => (
            <Fragment key={row.id}>
              <div className="pt-matrix-rowhead">
                <span className="pt-matrix-rowname">{row.label}</span>
              </div>
              {colVals.map(col => (
                <div key={`${row.id}-${col.id}`} className="pt-matrix-cell">
                  {cell(row.id, col.id)}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

function framed(axis: LabStateAxis, stateId: string): ReactNode {
  const node = axis.renderSample?.(stateId)
  if (!node) return <div className="lab-empty-state">No sample</div>
  const story: Story = {
    id: `${axis.id}-${stateId}`,
    layer: "page",
    name: stateId,
    surface: true,
    render: () => node,
  }
  return (
    <div className="pt-matrix-stage">
      <LabPartPreview story={story} fill />
    </div>
  )
}

function LabPartsMatrix({
  selectedStories,
  stories,
  sources,
  states,
  devices,
}: {
  readonly selectedStories: readonly Story[]
  readonly stories: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly devices: readonly DeviceConfig[]
}) {
  const [rows, setRows] = useState<Axis>("parts")
  const [cols, setCols] = useState<Axis>("states")
  if (selectedStories.length === 0)
    return (
      <div className="lab-empty-state">
        Select parts in Gallery first, then open Matrix.
      </div>
    )

  const values = (axis: Axis): readonly AxisValue[] => {
    if (axis === "parts")
      return selectedStories.map(story => ({ id: story.id, label: story.name }))
    if (axis === "sources")
      return sources.map(source => ({ id: source.id, label: source.label }))
    if (axis === "states")
      return states.map(state => ({ id: state.id, label: state.label }))
    return devices.map(device => ({
      id: device.id,
      label: device.name,
      ratio: device.widthMm / device.heightMm,
    }))
  }
  const rowVals = values(rows)
  const colVals = values(cols)
  const base = selectedStories[0]

  return (
    <div className="pt-matrix-wrap">
      <div className="pt-matrix-axisbar">
        <label className="pt-matrix-axispick">
          Rows{" "}
          <select
            value={rows}
            onChange={event => setRows(event.target.value as Axis)}
          >
            <AxisOptions />
          </select>
        </label>
        <span className="pt-matrix-axissep" />
        <label className="pt-matrix-axispick">
          Columns{" "}
          <select
            value={cols}
            onChange={event => setCols(event.target.value as Axis)}
          >
            <AxisOptions />
          </select>
        </label>
      </div>
      <div className="pt-matrix-scroll">
        <div
          className="pt-matrix"
          style={{
            gridTemplateColumns: `150px repeat(${colVals.length}, minmax(220px, 1fr))`,
          }}
        >
          <div className="pt-matrix-corner" />
          {colVals.map(col => (
            <div key={col.id} className="pt-matrix-colhead">
              {col.label}
            </div>
          ))}
          {rowVals.map(row => (
            <Fragment key={row.id}>
              <div className="pt-matrix-rowhead">
                <span className="pt-matrix-rowname">{row.label}</span>
              </div>
              {colVals.map(col => {
                const story =
                  rows === "parts"
                    ? (stories.get(row.id) ?? base)
                    : cols === "parts"
                      ? (stories.get(col.id) ?? base)
                      : base
                const state = (
                  rows === "states"
                    ? row.id
                    : cols === "states"
                      ? col.id
                      : "ready"
                ) as SourceStatus
                const source =
                  rows === "sources"
                    ? row.id
                    : cols === "sources"
                      ? col.id
                      : sources[0]?.id
                const ratio =
                  rows === "devices"
                    ? row.ratio
                    : cols === "devices"
                      ? col.ratio
                      : undefined
                const variant = stateVariantFor(story, state, stories)
                const unsupportedSource = source && source !== sources[0]?.id
                return (
                  <div
                    key={`${row.id}-${col.id}`}
                    className="pt-matrix-cell"
                    style={ratio ? { aspectRatio: String(ratio) } : undefined}
                  >
                    {unsupportedSource ? (
                      <div className="lab-empty-state">
                        Source bindings affect Surface view, not this isolated
                        part.
                      </div>
                    ) : variant ? (
                      <div className="pt-matrix-stage">
                        <LabPartPreview story={variant} fill />
                      </div>
                    ) : (
                      <div className="lab-empty-state">No {state} variant</div>
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

function AxisOptions() {
  return (
    <>
      <option value="parts">Parts</option>
      <option value="sources">Sources</option>
      <option value="states">States</option>
      <option value="devices">Devices</option>
    </>
  )
}
