/**
 * Shift store — Variant B: search-forward spotlight.
 *
 * The editorial counterpoint to the grid: a large search field leads, the top
 * result becomes a full-bleed hero, and the rest trail beneath it as a
 * horizontal rail of cards. Where the grid treats every result equally, this
 * variant makes the strongest match the spectacle — the store as a curated
 * shelf, not a spreadsheet. Same search core, same Get/Play acquisition; only
 * the emphasis differs.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreCard } from "./ShiftStoreCard"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreSearchField } from "./ShiftStoreSearchField"
import { ShiftStoreSpotlightHero } from "./ShiftStoreSpotlightHero"
import type { ShiftStoreEntry } from "./shift-store-entry"
import { applyShiftStoreQuery } from "./shift-store-query"

export interface ShiftStoreSpotlightProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly onGet?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftStoreSpotlight({
  entries,
  onGet,
  onBack,
}: ShiftStoreSpotlightProps) {
  const [text, setText] = useState("")

  const visible = useMemo(
    () =>
      applyShiftStoreQuery(entries, { text, sources: [], sort: "relevance" }),
    [entries, text],
  )

  useInputAction("back", () => onBack?.())

  const [featured, ...rest] = visible

  return (
    <div
      data-shift-store
      className="shift-store shift-store-spotlight intrinsic"
    >
      <ShiftStoreSearchField
        value={text}
        onChange={setText}
        placeholder="Search the store"
      />
      {featured ? (
        <>
          <ShiftStoreSpotlightHero entry={featured} onGet={onGet} />
          {rest.length > 0 ? (
            <div className="shift-store-rail">
              {rest.map(entry => (
                <ShiftStoreCard key={entry.id} entry={entry} onGet={onGet} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <ShiftStoreEmpty />
      )}
    </div>
  )
}
