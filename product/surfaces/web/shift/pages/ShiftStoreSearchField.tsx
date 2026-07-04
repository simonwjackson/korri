/**
 * Shift store — the search field (molecule).
 *
 * The one text input that drives a remote-catalog search. A native <input> so
 * the platform focus/typing path works the same across keyboard, on-screen
 * keyboard, and desktop bridge; it only reports the typed text, and the variant
 * owns the query state. The leading glyph is decorative.
 */
import { Search } from "lucide-react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreSearchFieldProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}

export function ShiftStoreSearchField({
  value,
  onChange,
  placeholder = "Search every source",
}: ShiftStoreSearchFieldProps) {
  return (
    <div
      className="shift-store-search"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeSearch)}
    >
      <Search className="shift-store-search-glyph" aria-hidden="true" />
      <input
        type="search"
        className="shift-store-search-input"
        value={value}
        placeholder={placeholder}
        aria-label="Search the store"
        onChange={event => onChange(event.target.value)}
      />
    </div>
  )
}
