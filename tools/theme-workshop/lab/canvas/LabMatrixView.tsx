import { Fragment, useState } from "react"
import type { Story } from "../../types"
import type { DeviceConfig } from "../../device-lab"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import { LabScaledPreview } from "./LabScaledPreview"
import { stateVariantFor } from "../model/lab-part-model"
import type { LabSourceOption, LabStateOption, SourceStatus } from "../model/lab-source-state"

type Axis = "parts" | "sources" | "states" | "devices"
type AxisValue = { readonly id: string; readonly label: string; readonly ratio?: number }

export function LabMatrixView({
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
  if (selectedStories.length === 0) return <div className="lab-empty-state">Select parts in Gallery first, then open Matrix.</div>

  const values = (axis: Axis): readonly AxisValue[] => {
    if (axis === "parts") return selectedStories.map(story => ({ id: story.id, label: story.name }))
    if (axis === "sources") return sources.map(source => ({ id: source.id, label: source.label }))
    if (axis === "states") return states.map(state => ({ id: state.id, label: state.label }))
    return devices.map(device => ({ id: device.id, label: device.name, ratio: device.widthMm / device.heightMm }))
  }
  const rowVals = values(rows)
  const colVals = values(cols)
  const base = selectedStories[0]

  return (
    <div className="pt-matrix-wrap">
      <div className="pt-matrix-axisbar">
        <label className="pt-matrix-axispick">Rows <select value={rows} onChange={event => setRows(event.target.value as Axis)}><AxisOptions /></select></label>
        <span className="pt-matrix-axissep" />
        <label className="pt-matrix-axispick">Columns <select value={cols} onChange={event => setCols(event.target.value as Axis)}><AxisOptions /></select></label>
      </div>
      <div className="pt-matrix-scroll">
        <div className="pt-matrix" style={{ gridTemplateColumns: `150px repeat(${colVals.length}, minmax(220px, 1fr))` }}>
          <div className="pt-matrix-corner" />
          {colVals.map(col => <div key={col.id} className="pt-matrix-colhead">{col.label}</div>)}
          {rowVals.map(row => (
            <Fragment key={row.id}>
              <div className="pt-matrix-rowhead"><span className="pt-matrix-rowname">{row.label}</span></div>
              {colVals.map(col => {
                const story = rows === "parts" ? stories.get(row.id) ?? base : cols === "parts" ? stories.get(col.id) ?? base : base
                const state = (rows === "states" ? row.id : cols === "states" ? col.id : "ready") as SourceStatus
                const source = rows === "sources" ? row.id : cols === "sources" ? col.id : sources[0]?.id
                const ratio = rows === "devices" ? row.ratio : cols === "devices" ? col.ratio : undefined
                const variant = stateVariantFor(story, state, stories)
                const unsupportedSource = source && source !== sources[0]?.id
                return (
                  <div key={`${row.id}-${col.id}`} className="pt-matrix-cell" style={ratio ? { aspectRatio: String(ratio) } : undefined}>
                    {unsupportedSource ? (
                      <div className="lab-empty-state">Source bindings affect Surface view, not this isolated part.</div>
                    ) : variant ? (
                      <div className="pt-matrix-stage"><LabScaledPreview><LabPreviewBoundary label={variant.name}>{variant.render()}</LabPreviewBoundary></LabScaledPreview></div>
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
