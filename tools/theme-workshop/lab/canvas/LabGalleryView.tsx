import type { LabPartsCatalog } from "../parts-discovery"
import type { LabStoryIndex } from "../model/lab-part-model"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"

export function LabGalleryView({
  catalog,
  index,
  onSelect,
}: {
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
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
    <div className="lab-gallery" {...catalog.rootProps}>
      {catalog.errors?.map(error => (
        <div key={error.path} role="alert" className="lab-catalog-error">
          Failed to load {error.path}: {error.message}
        </div>
      ))}
      {index.groups.map(group => (
        <section key={group.layer} className="lab-gallery-group">
          <h2>{group.layer}</h2>
          <div className="lab-gallery-grid">
            {group.stories.map(story => (
              <button key={story.id} type="button" className="lab-gallery-card" onClick={() => onSelect(story.id)}>
                <span className={`lab-layer-tag is-${story.layer}`}>{story.layer}</span>
                <strong>{story.name}</strong>
                {story.note ? <small>{story.note}</small> : null}
                <div className="lab-preview-frame">
                  <LabPreviewBoundary label={story.name}>{story.render()}</LabPreviewBoundary>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
