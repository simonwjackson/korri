import type { LabPartsCatalog } from "../parts-discovery"
import { partLabel, type LabStoryIndex } from "../model/lab-part-model"
import { LabPartPreview } from "./LabPartPreview"

export function LabGalleryView({
  catalog,
  index,
  selectedIds,
  onSelect,
}: {
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
  readonly selectedIds: readonly string[]
  readonly onSelect: (storyId: string) => void
}) {
  if (!catalog) return <div className="lab-empty-state">Discovering parts…</div>
  if (catalog.stories.length === 0 && !catalog.errors?.length) {
    return (
      <div className="lab-empty-state">
        No parts discovered for this surface. Add files like <code>Component.atom.part.tsx</code>.
      </div>
    )
  }
  return (
    <div className="pt-gallery" {...catalog.rootProps}>
      {catalog.errors?.map(error => (
        <div key={error.path} role="alert" className="lab-catalog-error">
          Failed to load {error.path}: {error.message}
        </div>
      ))}
      {index.groups.map(group => (
        <section key={group.layer} className="pt-gallery-group">
          <header className="pt-gallery-head">
            <span className={`pt-layer-tag layer-${group.layer}`}>{group.layer}</span>
            <span className="pt-gallery-count">{group.stories.length}</span>
          </header>
          <div className="pt-grid">
            {group.stories.map(story => (
              <div
                key={story.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${story.name}`}
                className={`pt-card${selectedIds.includes(story.id) ? " is-sel" : ""}`}
                onClick={() => onSelect(story.id)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(story.id)
                  }
                }}
              >
                <div className="pt-card-stage">
                  <LabPartPreview story={story} fill />
                </div>
                <div className="pt-card-foot">
                  <span className={`pt-layer-tag layer-${story.layer}`}>{story.layer}</span>
                  <span className="pt-card-name">{partLabel(story)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
