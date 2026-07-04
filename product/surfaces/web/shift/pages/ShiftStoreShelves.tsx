/**
 * Shift store — Shelves: curated per-source bands fronted by the compact finder.
 *
 * The storefront front page: results are grouped into per-source shelves ("From
 * itch.io", "From Community"), each a scrollable row of selectable cover tiles.
 * A tile OPENS detail — no per-item acquire chrome. Search + filtering live in
 * one compact `ShiftStoreFinder` pill in the header; a query flattens the
 * shelves into a filtered grid, and selecting sources narrows which shelves
 * show. Opening the filter fans chips out as an overlay, never pushing content.
 *
 * Still an EXPLORATION — marked with `data-proto` so the design tooling knows
 * it is a take to promote/decompose, not a committed surface.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreFinder } from "./ShiftStoreFinder"
import { ShiftStoreShelf } from "./ShiftStoreShelf"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  groupShiftStoreBySource,
  toggleSource,
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
  const [text, setText] = useState("")
  const [sources, setSources] = useState<readonly string[]>([])

  const searching = text.trim().length > 0

  const facets = useMemo(() => deriveShiftStoreSources(entries), [entries])
  const shelves = useMemo(() => {
    const all = groupShiftStoreBySource(entries)
    return sources.length === 0
      ? all
      : all.filter(shelf => sources.includes(shelf.source))
  }, [entries, sources])
  const results = useMemo(
    () => applyShiftStoreQuery(entries, { text, sources, sort: "relevance" }),
    [entries, text, sources],
  )

  useInputAction("back", () => onBack?.())

  const finder = (
    <ShiftStoreFinder
      text={text}
      onText={setText}
      facets={facets}
      selected={sources}
      onToggleSource={source =>
        setSources(current => toggleSource(current, source))
      }
    />
  )

  return (
    <div
      data-shift-store
      data-proto="store-shelves"
      className="shift-store shift-store-shelves intrinsic"
    >
      <header className="shift-store-top">
        <h2 className="shift-store-heading">{title}</h2>
        {finder}
      </header>
      {searching ? (
        results.length > 0 ? (
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
        )
      ) : shelves.length > 0 ? (
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
