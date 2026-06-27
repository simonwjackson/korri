import { Fragment, type ReactNode, useState } from "react"
import type { Story } from "../../types"
import {
  axisEnabled,
  type LabScreenActive,
  type LabStateAxis,
  liveActiveMap,
  pinAxisActive,
} from "../model/lab-state-axis"
import { LabPartPreview } from "./LabPartPreview"

const ROW_NONE = "__none__"

function activeForCell(
  axes: readonly LabStateAxis[],
  rowAxis: LabStateAxis | null,
  rowVal: string,
  colAxis: LabStateAxis,
  colVal: string,
): LabScreenActive {
  let active = liveActiveMap(axes)
  active = pinAxisActive(active, colAxis, colVal)
  if (rowAxis) active = pinAxisActive(active, rowAxis, rowVal)
  return active
}

function dependentAxis(
  rowAxis: LabStateAxis | null,
  colAxis: LabStateAxis,
): LabStateAxis | null {
  if (rowAxis?.parent?.axisId === colAxis.id) return rowAxis
  if (rowAxis && colAxis.parent?.axisId === rowAxis.id) return colAxis
  return null
}

function relatedRowAxes(
  selectableAxes: readonly LabStateAxis[],
  colAxis: LabStateAxis,
): readonly LabStateAxis[] {
  return selectableAxes.filter(
    axis =>
      axis.id !== colAxis.id &&
      (axis.parent?.axisId === colAxis.id ||
        colAxis.parent?.axisId === axis.id),
  )
}

/** Fan a screen's state-machine axis across the grid: every value side by side,
 * seeded and static. A second single axis adds the cross-product, honoring
 * structural nesting. Multi axes are set-valued and therefore not fan-out dims. */
export function LabAxisMatrix({ axes }: { axes: readonly LabStateAxis[] }) {
  const selectableAxes = axes.filter(axis => axis.kind === "single")
  const [colId, setColId] = useState(selectableAxes[0]?.id ?? "")
  // Single axis by default — every value of the chosen axis side by side; pick a
  // second axis to add the cross-product.
  const [rowId, setRowId] = useState<string>(ROW_NONE)

  const colAxis =
    selectableAxes.find(axis => axis.id === colId) ?? selectableAxes[0]
  if (!colAxis) {
    return <div className="lab-empty-state">No single axes to fan out.</div>
  }
  const rowOptions = relatedRowAxes(selectableAxes, colAxis)
  // Guard against a stale/duplicate/unrelated row selection (e.g. after
  // switching columns): only structurally related axes can share a truthful
  // matrix cell because renderSample renders one axis sample, not an arbitrary
  // independent coordinate.
  const rowAxis =
    rowId === ROW_NONE ? null : (rowOptions.find(a => a.id === rowId) ?? null)

  const selectColumn = (next: string) => {
    setColId(next)
    if (rowId === next) setRowId(ROW_NONE)
  }

  const colVals = colAxis.states
  const rowVals = rowAxis ? rowAxis.states : [{ id: "__single__", label: "" }]

  const cell = (rowVal: string, colVal: string): ReactNode => {
    if (rowAxis) {
      const active = activeForCell(
        selectableAxes,
        rowAxis,
        rowVal,
        colAxis,
        colVal,
      )
      const dependent = dependentAxis(rowAxis, colAxis)
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
            value={colAxis.id}
            onChange={event => selectColumn(event.target.value)}
          >
            {selectableAxes.map(axis => (
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
            value={rowAxis ? rowAxis.id : ROW_NONE}
            onChange={event => setRowId(event.target.value)}
          >
            <option value={ROW_NONE}>—</option>
            {rowOptions.map(axis => (
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
