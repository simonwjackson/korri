/**
 * Shift store — the search + filter side panel (organism).
 *
 * The refine surface, with each control matched to its data's shape instead of
 * a uniform chip cloud:
 *   - Search: free text; it also covers DEVELOPERS (high-cardinality — a facet
 *     cloud there would be noise, so the field's placeholder says it).
 *   - Sort: pick-one → menu-cursor options (a caret marks the current sort).
 *   - Availability: a pick-one view lens (All / Not acquired / Ready to play)
 *     → underline tabs with counts.
 *   - Sources: small multi-select with provenance weight → LED-dot checklist
 *     rows, counts right-aligned.
 *   - Genres: the one true wrapping-chip facet → pure-typography chips.
 *   - Platforms: tiny fixed set → kicker caps.
 * A live result tally and clear-all keep the cost of the query visible. It only
 * reports intent — the host owns every piece of query state.
 */
import { X } from "lucide-react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftStoreSourceChip } from "./ShiftStoreSourceChip"
import {
  SHIFT_STORE_AVAILABILITIES,
  SHIFT_STORE_SORTS,
  type ShiftStoreAvailability,
  type ShiftStoreSort,
  type ShiftStoreSourceFacet,
  shiftStoreAvailabilityLabel,
  shiftStoreSortLabel,
} from "./shift-store-query"

interface FacetGroup {
  readonly facets: readonly ShiftStoreSourceFacet[]
  readonly selected: readonly string[]
  readonly onToggle: (value: string) => void
}

export interface ShiftStorePanelProps {
  readonly text: string
  readonly onText: (value: string) => void
  readonly sort: ShiftStoreSort
  readonly onSort: (sort: ShiftStoreSort) => void
  readonly availability: ShiftStoreAvailability
  readonly onAvailability: (availability: ShiftStoreAvailability) => void
  /** Entry counts behind the non-"all" lenses (shown on the tabs). */
  readonly availabilityCounts: {
    readonly available: number
    readonly ready: number
  }
  readonly sources: FacetGroup
  readonly genres: FacetGroup
  readonly platforms: FacetGroup
  /** Results matching the current query, shown as a live tally. */
  readonly resultCount: number
  /** Active refinements (drives Clear all and the trigger badge). */
  readonly activeCount: number
  readonly onClearAll: () => void
  readonly onClose?: () => void
}

export function ShiftStorePanel({
  text,
  onText,
  sort,
  onSort,
  availability,
  onAvailability,
  availabilityCounts,
  sources,
  genres,
  platforms,
  resultCount,
  activeCount,
  onClearAll,
  onClose,
}: ShiftStorePanelProps) {
  return (
    <aside
      className="shift-store-panel"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storePanel)}
    >
      <div className="shift-store-panel-head">
        <span className="shift-store-panel-title">Search & filters</span>
        {onClose ? (
          <button
            type="button"
            className="shift-store-panel-close"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <input
        type="search"
        className="shift-store-panel-search"
        value={text}
        placeholder="Search titles or developers"
        aria-label="Search the store"
        onChange={event => onText(event.target.value)}
      />

      <div className="shift-store-panel-meta">
        <span className="shift-store-panel-count">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </span>
        {activeCount > 0 || text.length > 0 ? (
          <button
            type="button"
            className="shift-store-panel-clear"
            onClick={onClearAll}
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="shift-store-panel-group">
        <span className="shift-store-panel-group-title">Sort</span>
        <div className="shift-store-panel-inline">
          {SHIFT_STORE_SORTS.map(option => (
            <ShiftStoreSourceChip
              key={option}
              variant="cursor"
              label={shiftStoreSortLabel(option)}
              active={sort === option}
              onClick={() => onSort(option)}
            />
          ))}
        </div>
      </div>

      <div className="shift-store-panel-group">
        <span className="shift-store-panel-group-title">Availability</span>
        <div className="shift-store-panel-inline">
          {SHIFT_STORE_AVAILABILITIES.map(option => (
            <ShiftStoreSourceChip
              key={option}
              variant="underline"
              label={shiftStoreAvailabilityLabel(option)}
              count={
                option === "available"
                  ? availabilityCounts.available
                  : option === "ready"
                    ? availabilityCounts.ready
                    : undefined
              }
              active={availability === option}
              onClick={() => onAvailability(option)}
            />
          ))}
        </div>
      </div>

      <div className="shift-store-panel-group">
        <span className="shift-store-panel-group-title">Sources</span>
        <div className="shift-store-panel-rows">
          {sources.facets.map(facet => (
            <ShiftStoreSourceChip
              key={facet.value}
              variant="dot"
              label={facet.value}
              count={facet.count}
              active={sources.selected.includes(facet.value)}
              onClick={() => sources.onToggle(facet.value)}
            />
          ))}
        </div>
      </div>

      <div className="shift-store-panel-group">
        <span className="shift-store-panel-group-title">Genres</span>
        <div className="shift-store-panel-chips">
          {genres.facets.map(facet => (
            <ShiftStoreSourceChip
              key={facet.value}
              variant="type"
              label={facet.value}
              count={facet.count}
              active={genres.selected.includes(facet.value)}
              onClick={() => genres.onToggle(facet.value)}
            />
          ))}
        </div>
      </div>

      <div className="shift-store-panel-group">
        <span className="shift-store-panel-group-title">Platforms</span>
        <div className="shift-store-panel-chips">
          {platforms.facets.map(facet => (
            <ShiftStoreSourceChip
              key={facet.value}
              variant="kicker"
              label={facet.value}
              count={facet.count}
              active={platforms.selected.includes(facet.value)}
              onClick={() => platforms.onToggle(facet.value)}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}
