/**
 * Shift store — a source shelf (organism).
 *
 * One titled, horizontally scrolled row of browse tiles for a single remote
 * source — the storefront's "From itch.io" / "From Community" band. Composes
 * the same selectable browse tile as the grid, so the whole storefront is
 * navigate-in-to-act, with no per-item chrome.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import type { ShiftStoreEntry } from "./shift-store-entry"

export interface ShiftStoreShelfProps {
  readonly title: string
  readonly entries: readonly ShiftStoreEntry[]
  readonly onOpen?: (id: string) => void
}

export function ShiftStoreShelf({
  title,
  entries,
  onOpen,
}: ShiftStoreShelfProps) {
  return (
    <section
      className="shift-store-shelf"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeShelf)}
    >
      <h3 className="shift-store-shelf-title">{title}</h3>
      <div className="shift-store-shelf-track">
        {entries.map(entry => (
          <ShiftStoreBrowseTile key={entry.id} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
