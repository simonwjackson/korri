import type { Story } from "../../types"
import { LAB_BIND_MIME } from "../panels/LabSourcesPanel"
import { type LabObjectInstance } from "../model/lab-canvas-state"
import { isSourceStatus, type LabSourceOption, type LabStateOption, type SourceStatus } from "../model/lab-source-state"
import { stateVariantFor } from "../model/lab-part-model"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"

function parseBind(value: string): { axis: "sourceId" | "stateId"; value: string } | null {
  const [axis, id] = value.split(":")
  if (axis === "source" && id) return { axis: "sourceId", value: id }
  if (axis === "state" && isSourceStatus(id)) return { axis: "stateId", value: id }
  return null
}

export function LabDraggablePart({
  instance,
  story,
  byId,
  sources,
  states,
  scale,
  onBind,
  onMove,
  onRemove,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly byId: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly scale: number
  readonly onBind: (id: string, patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>) => void
  readonly onMove: (id: string, x: number, y: number) => void
  readonly onRemove: (id: string) => void
}) {
  const x = instance.x ?? 24
  const y = instance.y ?? 24
  const variant = stateVariantFor(story, instance.stateId, byId)
  return (
    <section
      className="lab-object"
      style={{ left: x, top: y }}
      onDragOver={event => {
        if (event.dataTransfer.types.includes(LAB_BIND_MIME)) event.preventDefault()
      }}
      onDrop={event => {
        const bind = parseBind(event.dataTransfer.getData(LAB_BIND_MIME))
        if (bind) onBind(instance.id, { [bind.axis]: bind.value } as Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>)
      }}
    >
      <header
        onPointerDown={event => {
          const start = { x: event.clientX, y: event.clientY, ox: x, oy: y }
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const move = (next: PointerEvent) => onMove(
            instance.id,
            start.ox + (next.clientX - start.x) / scale,
            start.oy + (next.clientY - start.y) / scale,
          )
          const up = (next: PointerEvent) => {
            target.releasePointerCapture(next.pointerId)
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", up)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", up)
        }}
      >
        <span className={`lab-layer-tag is-${story.layer}`}>{story.layer}</span>
        <strong>{story.name}</strong>
        <button type="button" aria-label={`Remove ${story.name}`} onClick={() => onRemove(instance.id)}>×</button>
      </header>
      <div className="lab-object-controls">
        <label>Source <select value={instance.sourceId} onChange={event => onBind(instance.id, { sourceId: event.target.value })}>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
        <label>State <select value={instance.stateId} onChange={event => onBind(instance.id, { stateId: event.target.value as SourceStatus })}>{states.map(state => <option key={state.id} value={state.id}>{state.label}</option>)}</select></label>
      </div>
      <div className="lab-object-body">
        {variant ? <LabPreviewBoundary label={variant.name}>{variant.render()}</LabPreviewBoundary> : <div className="lab-empty-state">No {instance.stateId} variant.</div>}
      </div>
    </section>
  )
}
