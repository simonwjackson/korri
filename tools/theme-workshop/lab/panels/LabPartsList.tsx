import { Trash2 } from "lucide-react"
import type { Story } from "../../types"
import {
  type LabStoryGroup,
  type LabStoryIndex,
  partLabel,
  partMetaLabel,
} from "../model/lab-part-model"

/**
 * Compact list (tree) view of parts, grouped by atomic layer. The dense
 * counterpart to the visual gallery; tap a row to place it, or a layer's "all".
 */
export function LabPartsList({
  groups,
  metaById,
  selectedIds,
  onSelect,
  onSelectLayer,
  onDeleteAiTake,
}: {
  readonly groups: readonly LabStoryGroup[]
  readonly metaById: LabStoryIndex["designPassMetaById"]
  readonly selectedIds: readonly string[]
  readonly onSelect: (storyId: string) => void
  readonly onSelectLayer: (stories: readonly Story[]) => void
  readonly onDeleteAiTake?: (slug: string) => void
}) {
  return (
    <div className="pt-tree">
      <div className="pt-tree-hint">
        Tap to place on the workspace · tap again to remove
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
            const metaLabel = partMetaLabel(metaById.get(story.id))
            return (
              <div key={story.id} className="pt-tree-row">
                <button
                  type="button"
                  className={`pt-tree-item${on ? " is-sel" : ""}${story.pending ? " is-pending" : ""}`}
                  disabled={story.pending}
                  onClick={() => {
                    if (!story.pending) onSelect(story.id)
                  }}
                >
                  <span className="pt-tree-check" aria-hidden>
                    {story.pending ? "◌" : on ? "◉" : "○"}
                  </span>
                  <span className="pt-tree-name">{partLabel(story)}</span>
                  {story.pending ? (
                    <span className="pt-work-badge is-pending">Take</span>
                  ) : story.aiTakeSlug ? (
                    <span className="pt-work-badge">Take</span>
                  ) : metaLabel ? (
                    <span className="pt-work-badge">{metaLabel}</span>
                  ) : null}
                </button>
                {story.aiTakeSlug && !story.pending && onDeleteAiTake ? (
                  <button
                    type="button"
                    className="pt-card-delete"
                    aria-label={`Delete Take ${story.name}`}
                    onClick={() => onDeleteAiTake(story.aiTakeSlug ?? "")}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
