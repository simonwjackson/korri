import { Store } from "lucide-react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

/**
 * The rail's trailing "Store" affordance — a native focusable button that
 * lives in the cinematic rail as a distinct, non-game entry, mirroring
 * ShiftCineLibraryTile. It shares the `.shift-cine-tile` skin (focus lift,
 * centering, `data-cine-index` math), but renders a storefront motif instead
 * of cover art. Confirm on this tile opens the store route; the owning screen
 * wires `onActivate`.
 */
export interface ShiftCineStoreTileProps {
  readonly index: number
  readonly focused?: boolean
  readonly onFocus: () => void
  readonly onActivate: () => void
}

export function ShiftCineStoreTile({
  index,
  focused,
  onFocus,
  onActivate,
}: ShiftCineStoreTileProps) {
  return (
    <button
      type="button"
      data-cine-index={index}
      data-focused={focused || undefined}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineStoreTile)}
      className="shift-cine-tile shift-cine-tile-affordance"
      aria-label="Store"
      onFocus={onFocus}
      onClick={onActivate}
    >
      <span className="shift-cine-tile-affordance-inner">
        <Store className="shift-cine-tile-affordance-icon" aria-hidden />
        <span className="shift-cine-tile-affordance-label">Store</span>
      </span>
    </button>
  )
}
