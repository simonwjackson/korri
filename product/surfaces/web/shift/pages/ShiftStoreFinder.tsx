/**
 * Shift store — the finder (molecule).
 *
 * One compact control that carries both search and filtering, so neither eats a
 * standing row. It is a single pill: a filter segment attached to the LEFT of a
 * search segment, each a glyph until opened, so nothing is a persistent bar.
 *
 * Opening the filter never drops a vertical overlay: the source chips expand
 * HORIZONTALLY out of the pill, into the header's spare width, as a scrollable
 * strip. No overlay, no reflow of the results. (The maximal side-sheet
 * alternative lives in `ShiftStorePanel`, not here.)
 */
import { Search, SlidersHorizontal, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftStoreSourceChip } from "./ShiftStoreSourceChip"
import type { ShiftStoreSourceFacet } from "./shift-store-query"

export interface ShiftStoreFinderProps {
  readonly text: string
  readonly onText: (value: string) => void
  readonly facets: readonly ShiftStoreSourceFacet[]
  readonly selected: readonly string[]
  readonly onToggleSource: (source: string) => void
  /** Start with the filter open (uncontrolled initial state). Lets fixtures
   * and the dev-lab show the expanded strip without interaction. */
  readonly defaultFilterOpen?: boolean
}

export function ShiftStoreFinder({
  text,
  onText,
  facets,
  selected,
  onToggleSource,
  defaultFilterOpen = false,
}: ShiftStoreFinderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(defaultFilterOpen)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  const openSearch = () => {
    setFilterOpen(false)
    setSearchOpen(true)
  }
  const closeSearch = () => {
    setSearchOpen(false)
    onText("")
  }

  const chips = facets.map(facet => (
    <ShiftStoreSourceChip
      key={facet.value}
      label={facet.value}
      count={facet.count}
      active={selected.includes(facet.value)}
      onClick={() => onToggleSource(facet.value)}
    />
  ))

  return (
    <div
      className="shift-store-finder"
      data-search-open={searchOpen || undefined}
      data-filter-open={filterOpen || undefined}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeFinder)}
    >
      {filterOpen ? (
        <div className="shift-store-finder-strip">{chips}</div>
      ) : null}

      <div className="shift-store-finder-bar">
        <button
          type="button"
          className="shift-store-finder-filter"
          aria-label="Filters"
          aria-expanded={filterOpen}
          onClick={() => {
            setSearchOpen(false)
            setFilterOpen(open => !open)
          }}
        >
          <SlidersHorizontal
            className="shift-store-finder-glyph"
            aria-hidden="true"
          />
          {selected.length > 0 ? (
            <span className="shift-store-finder-dot">{selected.length}</span>
          ) : null}
        </button>

        {searchOpen ? (
          <span className="shift-store-finder-search">
            <Search className="shift-store-finder-glyph" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              className="shift-store-finder-input"
              value={text}
              placeholder="Search"
              aria-label="Search the store"
              onChange={event => onText(event.target.value)}
            />
            <button
              type="button"
              className="shift-store-finder-close"
              aria-label="Close search"
              onClick={closeSearch}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="shift-store-finder-open"
            aria-label="Search the store"
            onClick={openSearch}
          >
            <Search className="shift-store-finder-glyph" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
