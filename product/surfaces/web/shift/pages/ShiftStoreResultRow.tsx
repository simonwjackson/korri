/**
 * Shift store — a search-result row (molecule).
 *
 * The dense, information-forward unit the List variant stamps out: a small
 * thumbnail, the title with its source and metadata line, and the Get/Play
 * action at the end. Like the card, the row is a non-interactive group whose one
 * focusable is the acquire button, so a long results list is a clean vertical
 * run of actions.
 */

import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCoverArt } from "../ui/atoms/ShiftCoverArt"
import { ShiftStoreGetButton } from "./ShiftStoreGetButton"
import {
  type ShiftStoreEntry,
  shiftStoreSourcesLabel,
} from "./shift-store-entry"

export interface ShiftStoreResultRowProps {
  readonly entry: ShiftStoreEntry
  readonly onGet?: (id: string) => void
}

export function ShiftStoreResultRow({
  entry,
  onGet,
}: ShiftStoreResultRowProps) {
  const meta = [
    shiftStoreSourcesLabel(entry.sources),
    entry.genre,
    entry.platform,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <article
      className="shift-store-row"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeResultRow, entry.id)}
    >
      <span className="shift-store-row-thumb">
        <ShiftCoverArt src={entry.artUrl} loading="lazy" />
      </span>
      <div className="shift-store-row-body">
        <span className="shift-store-row-title">{entry.title}</span>
        <span className="shift-store-row-meta">{meta}</span>
      </div>
      <ShiftStoreGetButton
        status={entry.status}
        title={entry.title}
        onActivate={() => onGet?.(entry.id)}
      />
    </article>
  )
}
