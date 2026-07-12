/**
 * Shift store — a browse tile (molecule).
 *
 * The unit the Browse and Shelves variants stamp out, and the heart of the
 * corrected model: the tile itself is the action. It is one native cover
 * <button> that OPENS the entry's detail page (where the acquire action lives),
 * so a page of results carries no per-item Get/Play chrome — you navigate in,
 * then act. As a SMALL card it shows only cover + title; provenance (including
 * a grouped release's many sources) is a detail-page concern, not shown here.
 * Source-agnostic; reports selection by id.
 */

import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCoverArt } from "../ui/atoms/ShiftCoverArt"
import type { ShiftStoreEntry } from "./shift-store-entry"

export interface ShiftStoreBrowseTileProps {
  readonly entry: ShiftStoreEntry
  /** Open the entry's detail page. The host decides what detail shows. */
  readonly onOpen?: (id: string) => void
}

export function ShiftStoreBrowseTile({
  entry,
  onOpen,
}: ShiftStoreBrowseTileProps) {
  return (
    <button
      type="button"
      className="shift-store-tile"
      aria-label={entry.title}
      onClick={() => onOpen?.(entry.id)}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeBrowseTile, entry.id)}
    >
      <span className="shift-store-tile-art">
        <ShiftCoverArt src={entry.artUrl} loading="lazy" title={entry.title} />
      </span>
      <span className="shift-store-tile-body">
        <span className="shift-store-tile-title">{entry.title}</span>
      </span>
    </button>
  )
}
