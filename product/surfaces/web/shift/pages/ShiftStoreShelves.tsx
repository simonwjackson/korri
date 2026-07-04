/**
 * Shift store — Variant E: curated source shelves with summoned search.
 *
 * The storefront front page: results are grouped into per-source shelves ("From
 * itch.io", "From Community"), each a scrollable row of selectable cover tiles.
 * Browsing is the default; there is no standing search bar. A single search
 * affordance in the header flips the surface into a flat, filtered grid; `back`
 * returns to the shelves. As everywhere in this set, a tile OPENS detail — no
 * per-item acquire chrome.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreSearchField } from "./ShiftStoreSearchField"
import { ShiftStoreSearchTrigger } from "./ShiftStoreSearchTrigger"
import { ShiftStoreShelf } from "./ShiftStoreShelf"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  groupShiftStoreBySource,
} from "./shift-store-query"

export interface ShiftStoreShelvesProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  readonly onOpen?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftStoreShelves({
  entries,
  title = "Store",
  onOpen,
  onBack,
}: ShiftStoreShelvesProps) {
  const [searching, setSearching] = useState(false)
  const [text, setText] = useState("")

  const shelves = useMemo(() => groupShiftStoreBySource(entries), [entries])
  const results = useMemo(
    () =>
      applyShiftStoreQuery(entries, { text, sources: [], sort: "relevance" }),
    [entries, text],
  )

  const exitSearch = () => {
    setSearching(false)
    setText("")
  }

  useInputAction("back", () => {
    if (searching) exitSearch()
    else onBack?.()
  })

  if (searching) {
    return (
      <div
        data-shift-store
        className="shift-store shift-store-shelves intrinsic"
      >
        <ShiftStoreSearchField
          autoFocus
          value={text}
          onChange={setText}
          onClose={exitSearch}
        />
        {results.length > 0 ? (
          <div className="shift-store-tiles">
            {results.map(entry => (
              <ShiftStoreBrowseTile
                key={entry.id}
                entry={entry}
                onOpen={onOpen}
              />
            ))}
          </div>
        ) : (
          <ShiftStoreEmpty />
        )}
      </div>
    )
  }

  return (
    <div data-shift-store className="shift-store shift-store-shelves intrinsic">
      <header className="shift-store-top">
        <h2 className="shift-store-heading">{title}</h2>
        <ShiftStoreSearchTrigger onActivate={() => setSearching(true)} />
      </header>
      {shelves.length > 0 ? (
        <div className="shift-store-shelf-stack">
          {shelves.map(shelf => (
            <ShiftStoreShelf
              key={shelf.source}
              title={shelf.source}
              entries={shelf.entries}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <ShiftStoreEmpty message="Nothing to browse yet." />
      )}
    </div>
  )
}
