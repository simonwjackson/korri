/**
 * Shift store — Variant F: alphabetical index with summoned search.
 *
 * The scan-first take: a plain vertical index of rows, alphabetical by default,
 * each row the full-width navigation target that opens detail. This is the one
 * variant where a "view" cue reads naturally, so each row carries a quiet
 * trailing chevron rather than a button. Search is summoned from the header, not
 * standing; `back` leaves search before it leaves the store.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreIndexRow } from "./ShiftStoreIndexRow"
import { ShiftStoreSearchField } from "./ShiftStoreSearchField"
import { ShiftStoreSearchTrigger } from "./ShiftStoreSearchTrigger"
import type { ShiftStoreEntry } from "./shift-store-entry"
import { applyShiftStoreQuery } from "./shift-store-query"

export interface ShiftStoreIndexProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  readonly onOpen?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftStoreIndex({
  entries,
  title = "Store",
  onOpen,
  onBack,
}: ShiftStoreIndexProps) {
  const [searching, setSearching] = useState(false)
  const [text, setText] = useState("")

  const visible = useMemo(
    () =>
      applyShiftStoreQuery(entries, {
        text: searching ? text : "",
        sources: [],
        sort: searching ? "relevance" : "title",
      }),
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
    <div data-shift-store className="shift-store shift-store-index intrinsic">
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
        <div className="shift-store-index-rows">
          {visible.map(entry => (
            <ShiftStoreIndexRow key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <ShiftStoreEmpty />
      )}
    </div>
  )
}
