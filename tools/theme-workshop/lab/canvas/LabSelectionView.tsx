import type { Story } from "../../types"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import { type LabObjectInstance } from "../model/lab-canvas-state"
import { type SourceStatus, type LabSourceOption, type LabStateOption } from "../model/lab-source-state"
import { stateVariantFor } from "../model/lab-part-model"

export function LabSelectionView({
  story,
  byId,
  instance,
  sources,
  states,
  onBind,
}: {
  readonly story: Story | null
  readonly byId: ReadonlyMap<string, Story>
  readonly instance: LabObjectInstance | null
  readonly sources: readonly LabSourceOption[]
  readonly states: readonly LabStateOption[]
  readonly onBind: (id: string, patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>) => void
}) {
  if (!story) return <div className="lab-empty-state">Select a part to inspect it.</div>
  const selectedState = instance?.stateId ?? "ready"
  const variant = stateVariantFor(story, selectedState, byId)
  return (
    <div className="lab-selection-view">
      <div className="lab-artboard">
        <header>
          <span className={`lab-layer-tag is-${story.layer}`}>{story.layer}</span>
          <strong>{story.name}</strong>
        </header>
        <div className="lab-artboard-body">
          {variant ? (
            <LabPreviewBoundary label={variant.name}>{variant.render()}</LabPreviewBoundary>
          ) : (
            <div className="lab-empty-state">No {selectedState} variant for {story.name}.</div>
          )}
        </div>
        {story.note ? <p>{story.note}</p> : null}
        {instance ? (
          <div className="lab-object-controls">
            <label>Source <select value={instance.sourceId} onChange={event => onBind(instance.id, { sourceId: event.target.value })}>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
            <label>State <select value={instance.stateId} onChange={event => onBind(instance.id, { stateId: event.target.value as SourceStatus })}>{states.map(state => <option key={state.id} value={state.id}>{state.label}</option>)}</select></label>
          </div>
        ) : null}
      </div>
    </div>
  )
}
