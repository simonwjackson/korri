import type { Story } from "../../types"
import { type LabStoryGroup, partLabel } from "../model/lab-part-model"

export function LabPartsPanel({
  groups,
  selectedIds,
  onSelect,
  onSelectLayer,
}: {
  readonly groups: readonly LabStoryGroup[]
  readonly selectedIds: readonly string[]
  readonly onSelect: (story: Story) => void
  readonly onSelectLayer: (stories: readonly Story[]) => void
}) {
  return (
    <div className="pt-tree">
      <div className="pt-tree-hint">
        Tap to place on the device · tap again to remove
      </div>
      {groups.map(group => (
        <div key={group.layer} className="pt-tree-group">
          <button
            type="button"
            className="pt-tree-layer"
            onClick={() => onSelectLayer(group.stories)}
          >
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
                onClick={() => onSelect(story)}
              >
                <span className="pt-tree-check" aria-hidden>
                  {on ? "◉" : "○"}
                </span>
                {partLabel(story)}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
