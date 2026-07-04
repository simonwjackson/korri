/**
 * Shift store — a result card (molecule).
 *
 * The unit the grid and spotlight-rail variants stamp out: portrait cover art,
 * the title, and the single Get/Play action. It is a SMALL card, so it does not
 * surface where the release comes from — provenance (and grouped-source detail)
 * lives in roomier places. The card itself is a non-interactive group; its one
 * focusable is the acquire button, so a grid of cards moves focus
 * button-to-button with no nested-interactive ambiguity. Source-agnostic — it
 * takes a flat entry and reports intent by id.
 */

import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftCoverArt } from "../ui/atoms/ShiftCoverArt"
import { ShiftStoreGetButton } from "./ShiftStoreGetButton"
import type { ShiftStoreEntry } from "./shift-store-entry"

export interface ShiftStoreCardProps {
  readonly entry: ShiftStoreEntry
  /** Acquire (Get) or launch (Play) the entry. */
  readonly onGet?: (id: string) => void
}

export function ShiftStoreCard({ entry, onGet }: ShiftStoreCardProps) {
  return (
    <article
      className="shift-store-card"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeCard, entry.id)}
    >
      <span className="shift-store-card-art">
        <ShiftCoverArt src={entry.artUrl} loading="lazy" />
      </span>
      <div className="shift-store-card-body">
        <span className="shift-store-card-title">{entry.title}</span>
      </div>
      <ShiftStoreGetButton
        status={entry.status}
        title={entry.title}
        onActivate={() => onGet?.(entry.id)}
      />
    </article>
  )
}
