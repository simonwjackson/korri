import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import {
  objectStateGroupsForStory,
  resolveObjectStateGroupValues,
} from "../model/lab-object-state-groups"
import type { LabSourceOption, SourceStatus } from "../model/lab-source-state"

/**
 * Inspector scoped to the selected Compose object. Its bindings — data source
 * plus zero/one/many state groups — stack vertically and scroll instead of
 * crowding the object's title bar horizontally. No state group is special to the
 * Inspector; a group's render role is consumed by the canvas, not by this UI.
 */
export function LabObjectInspector({
  instance,
  story,
  byId,
  sources,
  onBind,
  onBindStateGroup,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly byId: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly onBind: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => void
  readonly onBindStateGroup: (
    id: string,
    groupId: string,
    stateId: SourceStatus,
  ) => void
}) {
  const { adapter } = useLab()
  const groups = objectStateGroupsForStory(story, byId, adapter)
  const values = resolveObjectStateGroupValues(
    groups,
    instance.stateGroupValues,
  )

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
        {groups.map(group => (
          <label key={group.id} className="pt-bind-row">
            <span className="pt-bind-label">{group.label}</span>
            <select
              value={values[group.id] ?? group.defaultStateId}
              aria-label={`${group.label} for ${story.name}`}
              onChange={event =>
                onBindStateGroup(instance.id, group.id, event.target.value)
              }
            >
              {group.states.map(state => (
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
