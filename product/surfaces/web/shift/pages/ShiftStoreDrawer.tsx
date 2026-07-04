/**
 * Shift store — Drawer: the browse grid with the full side panel.
 *
 * The side-panel exploration: one "Search & filters" affordance in the header
 * opens a pinned right-edge sheet where each refine control matches its data's
 * shape — search (which also covers developers), pick-one sort, an
 * availability lens, source checklist rows, genre chips, platform caps. Each
 * group deliberately wears a DIFFERENT surviving chip candidate so the
 * candidates can be judged in context, in one screen. Results stay a
 * navigate-in-to-detail tile grid (no acquire chrome).
 *
 * An EXPLORATION — marked with `data-proto` so the design tooling knows it is a
 * take to promote/decompose, not a committed surface.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { Search, SlidersHorizontal } from "lucide-react"
import { useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "./ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "./ShiftStoreEmpty"
import { ShiftStorePanel } from "./ShiftStorePanel"
import type { ShiftStoreEntry } from "./shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  deriveShiftStoreStatuses,
  deriveShiftStoreValues,
  type ShiftStoreAvailability,
  type ShiftStoreSort,
  shiftStoreAvailabilityStatuses,
  toggleSource,
} from "./shift-store-query"

export interface ShiftStoreDrawerProps {
  readonly entries: readonly ShiftStoreEntry[]
  readonly title?: string
  readonly onOpen?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftStoreDrawer({
  entries,
  title = "Store",
  onOpen,
  onBack,
}: ShiftStoreDrawerProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [text, setText] = useState("")
  const [sort, setSort] = useState<ShiftStoreSort>("relevance")
  const [availability, setAvailability] =
    useState<ShiftStoreAvailability>("all")
  const [sources, setSources] = useState<readonly string[]>([])
  const [genres, setGenres] = useState<readonly string[]>([])
  const [platforms, setPlatforms] = useState<readonly string[]>([])

  const sourceFacets = useMemo(
    () => deriveShiftStoreSources(entries),
    [entries],
  )
  const genreFacets = useMemo(
    () => deriveShiftStoreValues(entries, entry => entry.genre),
    [entries],
  )
  const platformFacets = useMemo(
    () => deriveShiftStoreValues(entries, entry => entry.platform),
    [entries],
  )
  const availabilityCounts = useMemo(() => {
    const facets = deriveShiftStoreStatuses(entries)
    const count = (status: string) =>
      facets.find(facet => facet.value === status)?.count ?? 0
    return {
      available: count("available") + count("acquiring"),
      ready: count("ready"),
    }
  }, [entries])

  const visible = useMemo(
    () =>
      applyShiftStoreQuery(entries, {
        text,
        sort,
        sources,
        genres,
        platforms,
        statuses: shiftStoreAvailabilityStatuses(availability),
      }),
    [entries, text, sort, sources, genres, platforms, availability],
  )

  const activeCount =
    sources.length +
    genres.length +
    platforms.length +
    (availability === "all" ? 0 : 1)

  const clearAll = () => {
    setText("")
    setAvailability("all")
    setSources([])
    setGenres([])
    setPlatforms([])
  }

  useInputAction("back", () => {
    if (panelOpen) setPanelOpen(false)
    else onBack?.()
  })

  return (
    <div
      data-shift-store
      data-proto="store-drawer"
      className="shift-store shift-store-drawer intrinsic"
    >
      <div className="shift-store-drawer-scroll">
        <header className="shift-store-top">
          <h2 className="shift-store-heading">{title}</h2>
          <button
            type="button"
            className="shift-store-panel-trigger"
            aria-label="Search and filters"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(open => !open)}
          >
            <SlidersHorizontal
              className="shift-store-finder-glyph"
              aria-hidden="true"
            />
            <Search className="shift-store-finder-glyph" aria-hidden="true" />
            {activeCount > 0 ? (
              <span className="shift-store-finder-dot">{activeCount}</span>
            ) : null}
          </button>
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

      {panelOpen ? (
        <ShiftStorePanel
          text={text}
          onText={setText}
          sort={sort}
          onSort={setSort}
          availability={availability}
          onAvailability={setAvailability}
          availabilityCounts={availabilityCounts}
          sources={{
            facets: sourceFacets,
            selected: sources,
            onToggle: value =>
              setSources(current => toggleSource(current, value)),
          }}
          genres={{
            facets: genreFacets,
            selected: genres,
            onToggle: value =>
              setGenres(current => toggleSource(current, value)),
          }}
          platforms={{
            facets: platformFacets,
            selected: platforms,
            onToggle: value =>
              setPlatforms(current => toggleSource(current, value)),
          }}
          resultCount={visible.length}
          activeCount={activeCount}
          onClearAll={clearAll}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </div>
  )
}
