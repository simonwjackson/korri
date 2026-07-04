/**
 * Shift store — the search affordance (atom).
 *
 * The entry point into search. Search is not a standing bar in the browse-first
 * variants — you go INTO it: this quiet affordance sits in the header, and
 * activating it flips the surface into search mode (revealing the field). One
 * native <button> so the platform focus engine reaches it like any control.
 */
import { Search } from "lucide-react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreSearchTriggerProps {
  readonly onActivate?: () => void
  readonly label?: string
}

export function ShiftStoreSearchTrigger({
  onActivate,
  label = "Search",
}: ShiftStoreSearchTriggerProps) {
  return (
    <button
      type="button"
      className="shift-store-search-trigger"
      aria-label="Search the store"
      onClick={() => onActivate?.()}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeSearchTrigger)}
    >
      <Search className="shift-store-search-trigger-glyph" aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
