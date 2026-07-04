/**
 * Shift store — Variant A: search + additive result grid.
 *
 * The catchall "browse the store" surface: a standing search field and source
 * chips above one dense, additive grid of result cards. The grid adds columns
 * as the frame widens (auto-fill + a base-relative min track), so a TV shows
 * more of the catalog at once rather than the same few zoomed up. It models a
 * console store, but every card's action is Get/Play — acquisition, never
 * purchase.
 *
 * Source-agnostic and fixture-driven: it takes flat store entries and reports
 * intent by id. The composition root (device-lab config today, a route later)
 * supplies the entries and runs the real search/acquire.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreCard } from "./ShiftStoreCard"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreHeader } from "./ShiftStoreHeader"
import { ShiftStoreSearchField } from "./ShiftStoreSearchField"
import { ShiftStoreSourceChip } from "./ShiftStoreSourceChip"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  nextShiftStoreSort,
  type ShiftStoreSort,
  shiftStoreSortLabel,
  toggleSource,
} from "./shift-store-query"

export interface ShiftStoreGridProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  /** Acquire (Get) or launch (Play) an entry. */
  readonly onGet?: (id: string) => void
  /** Leave the store (semantic `back`). Omitted = inert. */
  readonly onBack?: () => void
}

export function ShiftStoreGrid({
  entries,
  title = "Store",
  onGet,
  onBack,
}: ShiftStoreGridProps) {
  const [text, setText] = useState("")
  const [sources, setSources] = useState<readonly string[]>([])
  const [sort, setSort] = useState<ShiftStoreSort>("relevance")

  const facets = useMemo(() => deriveShiftStoreSources(entries), [entries])
  const visible = useMemo(
    () => applyShiftStoreQuery(entries, { text, sources, sort }),
    [entries, text, sources, sort],
  )

  useInputAction("back", () => onBack?.())

  return (
    <div data-shift-store className="shift-store shift-store-grid intrinsic">
      <ShiftStoreHeader title={title} count={visible.length} />
      <ShiftStoreSearchField value={text} onChange={setText} />
      <div
        className="shift-store-chips"
        role="toolbar"
        aria-label="Filter and sort"
      >
        {facets.map(facet => (
          <ShiftStoreSourceChip
            key={facet.value}
            label={facet.value}
            count={facet.count}
            active={sources.includes(facet.value)}
            onClick={() =>
              setSources(current => toggleSource(current, facet.value))
            }
          />
        ))}
        <ShiftStoreSourceChip
          sort
          label={`Sort: ${shiftStoreSortLabel(sort)}`}
          onClick={() => setSort(nextShiftStoreSort)}
        />
      </div>
      {visible.length > 0 ? (
        <div className="shift-store-cards">
          {visible.map(entry => (
            <ShiftStoreCard key={entry.id} entry={entry} onGet={onGet} />
          ))}
        </div>
      ) : (
        <ShiftStoreEmpty />
      )}
    </div>
  )
}
