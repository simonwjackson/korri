/**
 * Shift library — the shelf/grid header (molecule).
 *
 * The `.shift-lib-top` bar every library variant opens with: a heading, an
 * optional game count, and an optional trailing control slot (e.g. the Lens
 * variant's summoned-sort button). Extracted so the four variants that inline
 * this exact markup compose one real part instead of repeating it.
 */
import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftLibraryCount, shiftLibraryCountLabel } from "./ShiftLibraryCount"
import { ShiftLibraryHeading } from "./ShiftLibraryHeading"

// Re-exported for callers that used to import the label from the header.
export { shiftLibraryCountLabel }

export interface ShiftLibraryHeaderProps {
  readonly title?: string
  /** Show a "N games" count beside the heading; omit for count-less variants. */
  readonly count?: number
  /** Trailing control slot (e.g. the Lens sort button). */
  readonly children?: ReactNode
}

export function ShiftLibraryHeader({
  title = "Library",
  count,
  children,
}: ShiftLibraryHeaderProps) {
  return (
    <header
      className="shift-lib-top"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.libraryHeader)}
    >
      <ShiftLibraryHeading title={title} />
      {count !== undefined ? <ShiftLibraryCount count={count} /> : null}
      {children}
    </header>
  )
}
