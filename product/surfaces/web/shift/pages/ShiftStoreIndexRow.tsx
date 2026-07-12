/**
 * Shift store — an index row (molecule).
 *
 * The dense list unit. The whole row is one native <button> that opens the
 * entry's detail page — no acquire chrome on the browse page. A list is the one
 * place a "view" cue earns its keep, so the row carries a quiet trailing
 * chevron (a hint, not a filled action) rather than a Get/Play button.
 */
import { ChevronRight } from "lucide-react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCoverArt } from "../ui/atoms/ShiftCoverArt"
import {
  type ShiftStoreEntry,
  shiftStoreSourcesLabel,
} from "./shift-store-entry"

export interface ShiftStoreIndexRowProps {
  readonly entry: ShiftStoreEntry
  readonly onOpen?: (id: string) => void
}

export function ShiftStoreIndexRow({ entry, onOpen }: ShiftStoreIndexRowProps) {
  const meta = [
    shiftStoreSourcesLabel(entry.sources),
    entry.genre,
    entry.platform,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <button
      type="button"
      className="shift-store-index-row"
      aria-label={entry.title}
      onClick={() => onOpen?.(entry.id)}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeIndexRow, entry.id)}
    >
      <span className="shift-store-index-thumb">
        <ShiftCoverArt src={entry.artUrl} loading="lazy" title={entry.title} />
      </span>
      <span className="shift-store-index-body">
        <span className="shift-store-index-title">{entry.title}</span>
        <span className="shift-store-index-meta">{meta}</span>
      </span>
      <ChevronRight className="shift-store-index-chevron" aria-hidden="true" />
    </button>
  )
}
