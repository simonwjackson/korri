import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import { statesForStory, stateVariantFor } from "../model/lab-part-model"
import type { LabSourceOption, SourceStatus } from "../model/lab-source-state"

/**
 * Inspector scoped to the selected Compose object. Its bindings — data source,
 * Data state, and any adapter-provided extra axes (foreground, …) — are an
 * open-ended list, so they stack vertically and scroll, instead of crowding the
 * object's title bar horizontally. The title bar now carries only identity,
 * drag, and remove.
 */
export function LabObjectInspector({
  instance,
  story,
  byId,
  sources,
  onBind,
  onBindAxis,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly byId: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly onBind: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>,
  ) => void
  readonly onBindAxis: (id: string, axisId: string, stateId: string) => void
}) {
  const { adapter } = useLab()
  const states = statesForStory(story, byId)
  const variant = stateVariantFor(story, instance.stateId, byId) ?? story
  const fill =
    Boolean(variant.surface) ||
    variant.layer === "page" ||
    variant.layer === "template"
  const extraAxes = fill ? (adapter.surfacePartAxes?.(story) ?? []) : []

  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">
        <span className={`pt-layer-tag layer-${story.layer}`}>
          {story.layer}
        </span>
        {story.name}
      </div>
      <div className="pt-bind">
        <label className="pt-bind-row">
          <span className="pt-bind-label">Data source</span>
          <select
            value={instance.sourceId}
            aria-label={`Data source for ${story.name}`}
            onChange={event =>
              onBind(instance.id, { sourceId: event.target.value })
            }
          >
            {sources.map(source => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pt-bind-row">
          <span className="pt-bind-label">State</span>
          <select
            value={instance.stateId}
            aria-label={`State for ${story.name}`}
            onChange={event =>
              onBind(instance.id, {
                stateId: event.target.value as SourceStatus,
              })
            }
          >
            {states.map(state => (
              <option key={state.id} value={state.id}>
                {state.label}
              </option>
            ))}
          </select>
        </label>
        {extraAxes.map(axis => (
          <label key={axis.id} className="pt-bind-row">
            <span className="pt-bind-label">{axis.label}</span>
            <select
              value={
                instance.axisStateIds?.[axis.id] ?? axis.states[0]?.id ?? ""
              }
              aria-label={`${axis.label} for ${story.name}`}
              onChange={event =>
                onBindAxis(instance.id, axis.id, event.target.value)
              }
            >
              {axis.states.map(state => (
                <option key={state.id} value={state.id}>
                  {state.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}
