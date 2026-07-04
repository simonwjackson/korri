/**
 * Shift store — the surface header (molecule).
 *
 * The `.shift-store-top` bar the grid and list variants open with: a heading
 * and an optional result count. Extracted so the variants compose one real part
 * instead of repeating the markup.
 */
import type { ReactNode } from "react"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export interface ShiftStoreHeaderProps {
  readonly title?: string
  /** Show an "N results" count beside the heading. */
  readonly count?: number
  /** Trailing control slot (e.g. a sort chip). */
  readonly children?: ReactNode
}

export function ShiftStoreHeader({
  title = "Store",
  count,
  children,
}: ShiftStoreHeaderProps) {
  return (
    <header
      className="shift-store-top"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeHeader)}
    >
      <h2 className="shift-store-heading">{title}</h2>
      {count !== undefined ? (
        <span className="shift-store-count">
          {count} {count === 1 ? "result" : "results"}
        </span>
      ) : null}
      {children}
    </header>
  )
}
