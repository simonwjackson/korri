import type { Story } from "../../types"
import { LabGalleryView } from "../canvas/LabGalleryView"
import type { LabStoryIndex } from "../model/lab-part-model"
import type { LabPartsCatalog } from "../parts-discovery"
import { LabPartsList } from "./LabPartsList"
import type { LabPartsView } from "./lab-parts-view"

/**
 * The Parts panel body. Renders either the visual gallery or the compact list;
 * the Visual ⇄ List switch lives in the panel titlebar (see LabPartsViewToggle),
 * so the active mode is passed in.
 */
export function LabPartsPanel({
  mode,
  catalog,
  index,
  selectedIds,
  onSelect,
  onSelectLayer,
  onDeleteAiTake,
}: {
  readonly mode: LabPartsView
  readonly catalog: LabPartsCatalog | null
  readonly index: LabStoryIndex
  readonly selectedIds: readonly string[]
  readonly onSelect: (storyId: string) => void
  readonly onSelectLayer: (stories: readonly Story[]) => void
  readonly onDeleteAiTake?: (slug: string) => void
}) {
  if (mode === "list")
    return (
      <LabPartsList
        groups={index.groups}
        metaById={index.designPassMetaById}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onSelectLayer={onSelectLayer}
        onDeleteAiTake={onDeleteAiTake}
      />
    )
  return (
    <LabGalleryView
      catalog={catalog}
      index={index}
      selectedIds={selectedIds}
      onSelect={onSelect}
      onSelectLayer={onSelectLayer}
      onDeleteAiTake={onDeleteAiTake}
    />
  )
}
