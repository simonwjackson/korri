import { LibraryBig } from "lucide-react"
import {
  SHIFT_DESIGN_PARTS,
  shiftDesignPartAttrs,
} from "../../shift-design-parts"

/**
 * The rail's trailing "Library" affordance — a native focusable button that
 * lives in the cinematic rail as a distinct, non-game entry. It shares the
 * `.shift-cine-tile` skin (so the focus lift, centering, and `data-cine-index`
 * math treat it exactly like a game tile), but renders a library motif instead
 * of cover art. Confirm on this tile opens the library route; the owning screen
 * wires `onActivate`.
 */
export interface ShiftCineLibraryTileProps {
  readonly index: number
  readonly focused?: boolean
  readonly onFocus: () => void
  readonly onActivate: () => void
}

export function ShiftCineLibraryTile({
  index,
  focused,
  onFocus,
  onActivate,
}: ShiftCineLibraryTileProps) {
  return (
    <button
      type="button"
      data-cine-index={index}
      data-focused={focused || undefined}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.cineLibraryTile)}
      className="shift-cine-tile shift-cine-tile-library"
      aria-label="Library"
      onFocus={onFocus}
      onClick={onActivate}
    >
      <span className="shift-cine-tile-library-inner">
        <LibraryBig className="shift-cine-tile-library-icon" aria-hidden />
        <span className="shift-cine-tile-library-label">Library</span>
      </span>
    </button>
  )
}
