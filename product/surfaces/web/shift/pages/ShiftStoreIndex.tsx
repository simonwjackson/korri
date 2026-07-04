/**
 * Shift store — Index: an alphabetical list fronted by the compact finder.
 *
 * The scan-first take: a plain vertical index of rows, alphabetical by default,
 * each row the full-width navigation target that opens detail with a quiet
 * trailing chevron. Search + filtering live in one compact `ShiftStoreFinder`
 * pill in the header; opening the filter fans chips out as an overlay so the
 * list never gets pushed down. When a query is present the rows re-rank by
 * relevance.
 *
 * Still an EXPLORATION — marked with `data-proto` so the design tooling knows
 * it is a take to promote/decompose, not a committed surface.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreFinder } from "./ShiftStoreFinder"
import { ShiftStoreIndexRow } from "./ShiftStoreIndexRow"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  toggleSource,
} from "./shift-store-query"

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
  const [text, setText] = useState("")
  const [sources, setSources] = useState<readonly string[]>([])

  const facets = useMemo(() => deriveShiftStoreSources(entries), [entries])
  const visible = useMemo(
    () =>
      applyShiftStoreQuery(entries, {
        text,
        sources,
        sort: text.trim().length > 0 ? "relevance" : "title",
      }),
    [entries, text, sources],
  )

  useInputAction("back", () => onBack?.())

  return (
    <div
      data-shift-store
      data-proto="store-index"
      className="shift-store shift-store-index intrinsic"
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
