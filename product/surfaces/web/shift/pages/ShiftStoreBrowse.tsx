/**
 * Shift store — Variant D: browse grid with summoned search.
 *
 * The corrected baseline. The page is a quiet additive grid of cover tiles; the
 * tile itself is the action — focusing and confirming OPENS the entry's detail
 * page, where the acquire choice lives. No Get/Play on this page. Search is not
 * a standing bar: the header carries a single search affordance you go INTO,
 * which flips the surface into a search field; `back` leaves search before it
 * leaves the store.
 *
 * Source-agnostic and fixture-driven: it takes flat store entries and reports
 * selection by id.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreSearchField } from "./ShiftStoreSearchField"
import { ShiftStoreSearchTrigger } from "./ShiftStoreSearchTrigger"
import type { ShiftStoreEntry } from "./shift-store-entry"
import { applyShiftStoreQuery } from "./shift-store-query"

export interface ShiftStoreBrowseProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  /** Open an entry's detail page. */
  readonly onOpen?: (id: string) => void
  /** Leave the store (semantic `back`). Omitted = inert. */
  readonly onBack?: () => void
}

export function ShiftStoreBrowse({
  entries,
  title = "Store",
  onOpen,
  onBack,
}: ShiftStoreBrowseProps) {
  const [searching, setSearching] = useState(false)
  const [text, setText] = useState("")

  const visible = useMemo(
    () =>
      searching
        ? applyShiftStoreQuery(entries, {
            text,
            sources: [],
            sort: "relevance",
          })
        : entries,
    [entries, searching, text],
  )

  const exitSearch = () => {
    setSearching(false)
    setText("")
  }

  useInputAction("back", () => {
    if (searching) exitSearch()
    else onBack?.()
  })

  return (
    <div data-shift-store className="shift-store shift-store-browse intrinsic">
      {searching ? (
        <ShiftStoreSearchField
          autoFocus
          value={text}
          onChange={setText}
          onClose={exitSearch}
        />
      ) : (
        <header className="shift-store-top">
          <h2 className="shift-store-heading">{title}</h2>
          <ShiftStoreSearchTrigger onActivate={() => setSearching(true)} />
        </header>
      )}
      {visible.length > 0 ? (
        <div className="shift-store-tiles">
          {visible.map(entry => (
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
