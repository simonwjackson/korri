/**
 * Shift store — the search field (molecule).
 *
 * The one text input that drives a remote-catalog search. It is not a standing
 * chrome element: variants SUMMON it (a search affordance flips into this), so
 * it takes an `autoFocus` to land the caret on entry and an optional `onClose`
 * that renders a dismiss control to leave search. A native <input> so the
 * platform focus/typing path works the same across keyboard, on-screen
 * keyboard, and desktop bridge; it only reports the typed text, and the variant
 * owns the query + search-mode state.
 */
import { Search, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreSearchFieldProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  /** Land the caret in the field on mount (search was just entered). */
  readonly autoFocus?: boolean
  /** Render a dismiss control that leaves search mode. */
  readonly onClose?: () => void
}

export function ShiftStoreSearchField({
  value,
  onChange,
  placeholder = "Search every source",
  autoFocus = false,
  onClose,
}: ShiftStoreSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <div
      className="shift-store-search"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeSearch)}
    >
      <Search className="shift-store-search-glyph" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="shift-store-search-input"
        value={value}
        placeholder={placeholder}
        aria-label="Search the store"
        onChange={event => onChange(event.target.value)}
      />
      {onClose ? (
        <button
          type="button"
          className="shift-store-search-close"
          aria-label="Close search"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
