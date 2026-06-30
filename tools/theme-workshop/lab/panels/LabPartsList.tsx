import type { Story } from "../../types"
import { type LabStoryGroup, partLabel } from "../model/lab-part-model"

/**
 * Compact list (tree) view of parts, grouped by atomic layer. The dense
 * counterpart to the visual gallery; tap a row to place it, or a layer's "all".
 */
export function LabPartsList({
  groups,
  selectedIds,
  onSelect,
  onSelectLayer,
}: {
  readonly groups: readonly LabStoryGroup[]
  readonly selectedIds: readonly string[]
  readonly onSelect: (storyId: string) => void
  readonly onSelectLayer: (stories: readonly Story[]) => void
}) {
  return (
    <div className="pt-tree">
      <div className="pt-tree-hint">
        Tap to place on the Compose screen · tap again to remove
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
                onClick={() => onSelect(story.id)}
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
