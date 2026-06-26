import type { Story } from "../../types"
import type { LabStoryGroup } from "../model/lab-part-model"

export function LabPartsPanel({
  groups,
  selectedIds,
  onSelect,
  onSelectLayer,
}: {
  readonly groups: readonly LabStoryGroup[]
  readonly selectedIds: readonly string[]
  readonly onSelect: (story: Story, additive: boolean) => void
  readonly onSelectLayer: (stories: readonly Story[]) => void
}) {
  return (
    <div className="pt-tree">
      <div className="pt-tree-hint">
        Tap to open · use <b>Multi</b> (or ⌘/Ctrl-click) to stack several
      </div>
      {groups.map(group => (
        <div key={group.layer} className="pt-tree-group">
          <button type="button" className="pt-tree-layer" onClick={() => onSelectLayer(group.stories)}>
            {group.layer}
            <span className="pt-tree-layer-all">all</span>
          </button>
          {group.stories.map(story => {
            const on = selectedIds.includes(story.id)
            return (
              <button
                key={story.id}
                type="button"
                className={`pt-tree-item${on ? " is-sel" : ""}`}
                onClick={event => onSelect(story, event.metaKey || event.ctrlKey || event.shiftKey)}
              >
                <span className="pt-tree-check" aria-hidden>{on ? "◉" : "○"}</span>
                {story.name}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
