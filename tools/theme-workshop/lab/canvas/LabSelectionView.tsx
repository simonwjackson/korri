import type { CSSProperties } from "react"
import type { Story } from "../../types"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import { LabScaledPreview } from "./LabScaledPreview"
import { stateVariantFor } from "../model/lab-part-model"
import { type LabObjectInstance } from "../model/lab-canvas-state"
import { type SourceStatus, type LabSourceOption, type LabStateOption } from "../model/lab-source-state"
import { useLab } from "../Lab.context"

export function LabSelectionView({
  story,
  byId,
  instance,
  sources,
  states,
  zoom,
  onBind,
}: {
  readonly story: Story | null
  readonly byId: ReadonlyMap<string, Story>
  readonly instance: LabObjectInstance | null
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly zoom: number
  readonly onBind: (id: string, patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>) => void
}) {
  const { adapter } = useLab()
  if (!story) return <div className="lab-empty-state">Select a part to inspect it.</div>
  const selectedState = instance?.stateId ?? "ready"
  const variant = stateVariantFor(story, selectedState, byId)
  return (
    <div className="pt-artboard" style={{ transform: `scale(${zoom})` } as CSSProperties}>
      <div className="pt-board pt-board-sm lab-real-board">
        {variant ? (
          <LabScaledPreview>
            <LabPreviewBoundary label={variant.name}>{variant.render()}</LabPreviewBoundary>
          </LabScaledPreview>
        ) : (
          <div className="lab-empty-state">No {selectedState} variant for {story.name}.</div>
        )}
      </div>
      <div className="pt-artboard-meta">
        <div className="pt-artboard-label">
          <span className={`pt-layer-tag layer-${story.layer}`}>{story.layer}</span>
          {adapter.id} · {story.name}
        </div>
        {story.note ? <div className="pt-artboard-note">{story.note}</div> : null}
        {instance ? (
          <div className="pt-artboard-data">
            <label className="pt-object-source">
              <span className="pt-object-source-icon" aria-hidden>◈</span>
              <select value={instance.sourceId} aria-label={`Data source for ${story.name}`} onChange={event => onBind(instance.id, { sourceId: event.target.value })}>
                {sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
            </label>
            <label className="pt-object-source">
              <span className="pt-object-source-icon pt-icon-state" aria-hidden>◆</span>
              <select value={instance.stateId} aria-label={`State for ${story.name}`} onChange={event => onBind(instance.id, { stateId: event.target.value as SourceStatus })}>
                {states.map(state => <option key={state.id} value={state.id}>{state.label}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  )
}
