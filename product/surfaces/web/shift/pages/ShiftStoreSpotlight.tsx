/**
 * Shift store — Spotlight: a featured hero over a rail, fronted by the finder.
 *
 * The editorial take: the strongest match becomes a full-bleed hero and the
 * rest trail beneath it as a rail. Nothing acquires in place — the hero and
 * every rail tile are navigation targets that open detail. Search + filtering
 * live in one compact `ShiftStoreFinder` pill in the header; opening the filter
 * fans chips out as an overlay so the hero never gets pushed down.
 *
 * Still an EXPLORATION — marked with `data-proto` so the design tooling knows
 * it is a take to promote/decompose, not a committed surface.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStoreFinder } from "./ShiftStoreFinder"
import { ShiftStoreSpotlightHero } from "./ShiftStoreSpotlightHero"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  toggleSource,
} from "./shift-store-query"

export interface ShiftStoreSpotlightProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  /** Open an entry's detail page. */
  readonly onOpen?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftStoreSpotlight({
  entries,
  title = "Store",
  onOpen,
  onBack,
}: ShiftStoreSpotlightProps) {
  const [text, setText] = useState("")
  const [sources, setSources] = useState<readonly string[]>([])

  const facets = useMemo(() => deriveShiftStoreSources(entries), [entries])
  const visible = useMemo(
    () => applyShiftStoreQuery(entries, { text, sources, sort: "relevance" }),
    [entries, text, sources],
  )

  useInputAction("back", () => onBack?.())

  const [featured, ...rest] = visible

  return (
    <div
      data-shift-store
      data-proto="store-spotlight"
      className="shift-store shift-store-spotlight intrinsic"
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
      {featured ? (
        <>
          <ShiftStoreSpotlightHero entry={featured} onOpen={onOpen} />
          {rest.length > 0 ? (
            <div className="shift-store-rail">
              {rest.map(entry => (
                <ShiftStoreBrowseTile
                  key={entry.id}
                  entry={entry}
                  onOpen={onOpen}
                />
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
