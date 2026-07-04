/**
 * Shift store — Browse: a quiet grid fronted by the compact finder.
 *
 * The page is a quiet additive grid of cover tiles; the tile itself is the
 * action — focusing and confirming OPENS the entry's detail page, where the
 * acquire choice lives. Search and filtering live in one compact `ShiftStoreFinder`
 * pill in the header (filter attached to the left of search); opening the filter
 * fans chips out as an overlay, so the grid never gets pushed down.
 *
 * Still an EXPLORATION — marked with `data-proto` so the design tooling knows
 * it is a take to promote/decompose, not a committed surface.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreFinder } from "./ShiftStoreFinder"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  toggleSource,
} from "./shift-store-query"

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
  const [text, setText] = useState("")
  const [sources, setSources] = useState<readonly string[]>([])

  const facets = useMemo(() => deriveShiftStoreSources(entries), [entries])
  const visible = useMemo(
    () => applyShiftStoreQuery(entries, { text, sources, sort: "relevance" }),
    [entries, text, sources],
  )

  useInputAction("back", () => onBack?.())

  return (
    <div
      data-shift-store
      data-proto="store-browse"
      className="shift-store shift-store-browse intrinsic"
    >
      <header className="shift-store-top">
        <h2 className="shift-store-heading">{title}</h2>
        <ShiftStoreFinder
          text={text}
          onText={setText}
          facets={facets}
          selected={sources}
          onToggleSource={source =>
            setSources(current => toggleSource(current, source))
          }
        />
      </header>
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
