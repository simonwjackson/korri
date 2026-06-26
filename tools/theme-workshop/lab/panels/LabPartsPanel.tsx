import type { Story } from "../../types"
import type { LabStoryGroup } from "../model/lab-part-model"

export function LabPartsPanel({
  groups,
  selectedIds,
  multi,
  onMultiChange,
  onSelect,
  onSelectLayer,
}: {
  readonly groups: readonly LabStoryGroup[]
  readonly selectedIds: readonly string[]
  readonly multi: boolean
  readonly onMultiChange: (multi: boolean) => void
  readonly onSelect: (story: Story, additive: boolean) => void
  readonly onSelectLayer: (stories: readonly Story[]) => void
}) {
  return (
    <div className="lab-panel-stack">
      <div className="lab-panel-hint">Auto-discovered parts. Multi keeps parts real-size on the canvas.</div>
      <label className="lab-inline-toggle">
        <input type="checkbox" checked={multi} onChange={event => onMultiChange(event.target.checked)} />
        Multi
      </label>
      {groups.map(group => (
        <section key={group.layer} className="lab-part-group">
          <header>
            <strong>{group.layer}</strong>
            <button type="button" onClick={() => onSelectLayer(group.stories)}>all</button>
          </header>
          {group.stories.map(story => (
            <button
              key={story.id}
              type="button"
              className={selectedIds.includes(story.id) ? "is-on" : ""}
              onClick={event => onSelect(story, multi || event.metaKey || event.ctrlKey)}
            >
              <span>{story.name}</span>
              {story.state ? <em>{story.state}</em> : null}
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}
