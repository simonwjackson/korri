/**
 * Shift store — Variant C: utilitarian results list.
 *
 * The information-forward take: a search field and source chips over a plain
 * vertical run of result rows, each showing a thumbnail, title, provenance and
 * metadata, and its Get/Play action. This is the "search-engine results" model
 * — the closest match to raw remote-catalog querying, favouring scan-ability
 * and density over spectacle. Same search core as the other two variants.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreHeader } from "./ShiftStoreHeader"
import { ShiftStoreResultRow } from "./ShiftStoreResultRow"
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

export interface ShiftStoreListProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  readonly onGet?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftStoreList({
  entries,
  title = "Store",
  onGet,
  onBack,
}: ShiftStoreListProps) {
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
    <div data-shift-store className="shift-store shift-store-list intrinsic">
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
        <div className="shift-store-rows">
          {visible.map(entry => (
            <ShiftStoreResultRow key={entry.id} entry={entry} onGet={onGet} />
          ))}
        </div>
      ) : (
        <ShiftStoreEmpty />
      )}
    </div>
  )
}
