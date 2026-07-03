import { Trash2 } from "lucide-react"
import type { Story } from "../../types"
import {
  type LabStoryIndex,
  partLabel,
  partMetaLabel,
} from "../model/lab-part-model"
import type { LabPartsCatalog } from "../parts-discovery"
import { LabPartPreview } from "./LabPartPreview"

/**
 * The single visual parts browser. Shown in the chrome Parts panel (and any
 * position it reflows into). Cards carry live previews; tapping one places the
 * part on the Compose board, and the per-layer "all" action places a whole layer
 * — folding the old small tree panel's behavior into the visual panel.
 */
export function LabGalleryView({
  catalog,
  index,
  selectedIds,
  onSelect,
  onSelectLayer,
  onDeleteAiTake,
}: {
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
  readonly selectedIds: readonly string[]
  readonly onSelect: (storyId: string) => void
  readonly onSelectLayer?: (stories: readonly Story[]) => void
  readonly onDeleteAiTake?: (slug: string) => void
}) {
  if (!catalog) return <div className="lab-empty-state">Discovering parts…</div>
  if (catalog.stories.length === 0 && !catalog.errors?.length) {
    return (
      <div className="lab-empty-state">
        No parts discovered for this surface. Add files like{" "}
        <code>Component.atom.part.tsx</code>.
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
            <span className={`pt-layer-tag layer-${group.layer}`}>
              {group.layer}
            </span>
            <span className="pt-gallery-count">{group.stories.length}</span>
            {onSelectLayer ? (
              <button
                type="button"
                className="pt-gallery-all"
                onClick={() => onSelectLayer(group.stories)}
              >
                all
              </button>
            ) : null}
          </header>
          <div className="pt-grid">
            {group.stories.map(story => {
              const metaLabel = partMetaLabel(
                index.designPassMetaById.get(story.id),
              )
              return (
                // biome-ignore lint/a11y/useSemanticElements: card wraps a live preview that may contain its own interactive elements
                <div
                  key={story.id}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    story.pending ? "Generating a Take" : `Open ${story.name}`
                  }
                  className={`pt-card${selectedIds.includes(story.id) ? " is-sel" : ""}${story.pending ? " is-pending" : ""}`}
                  onClick={() => {
                    if (!story.pending) onSelect(story.id)
                  }}
                  onKeyDown={event => {
                    if (
                      !story.pending &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault()
                      onSelect(story.id)
                    }
                  }}
                >
                  <div className="pt-card-stage">
                    {story.pending ? (
                      <div className="pt-card-generating" aria-hidden />
                    ) : (
                      <LabPartPreview story={story} fill />
                    )}
                  </div>
                  <div className="pt-card-foot">
                    <span className={`pt-layer-tag layer-${story.layer}`}>
                      {story.layer}
                    </span>
                    <span className="pt-card-name">{partLabel(story)}</span>
                    {story.pending ? (
                      <span className="pt-work-badge is-pending">Take</span>
                    ) : story.aiTakeSlug ? (
                      <span className="pt-work-badge">Take</span>
                    ) : metaLabel ? (
                      <span className="pt-work-badge">{metaLabel}</span>
                    ) : null}
                    {story.aiTakeSlug && !story.pending && onDeleteAiTake ? (
                      <button
                        type="button"
                        className="pt-card-delete"
                        aria-label={`Delete Take ${story.name}`}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={event => {
                          event.stopPropagation()
                          onDeleteAiTake(story.aiTakeSlug ?? "")
                        }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
