import type { ReactNode } from "react"
import {
  clampSpan,
  type GridItemShape,
  useTilegrid,
} from "../Tilegrid.context"

export interface TilegridCellsProps<T extends GridItemShape> {
  /**
   * Function the consumer supplies to produce each cell's visual children.
   * The atom owns the <button> wrapper, span styling, and aria-label; the
   * consumer's render output goes inside the button.
   */
  render: (item: T) => ReactNode
  /**
   * Optional click handler. Receives the item, not the DOM event, because
   * spatial-nav engines drive .click() programmatically and consumers care
   * about the item, not the synthetic event.
   */
  onItemClick?: (item: T) => void
  /**
   * Optional className applied to every button. Keep visual concerns in the
   * consumer's render output; this is for layout-affecting classes only.
   */
  buttonClassName?: string
}

/**
 * The single cell atom for both Tilegrid Roots. Reads items, span resolver,
 * and span limits from context, and renders one native <button aria-label>
 * per item with span styles applied for CSS Grid's `grid-auto-flow: dense`
 * (scroll mode) or fixed-track grid (paged mode) to consume.
 *
 * Spatial navigation reads these buttons from the live DOM via LRUD; no
 * focus hooks, refs, or providers are needed here.
 */
export function TilegridCells<T extends GridItemShape>({
  render,
  onItemClick,
  buttonClassName,
}: TilegridCellsProps<T>) {
  const { base } = useTilegrid<T>()
  const { items, getKey, getSpan, getAriaLabel, maxSpan } = base

  return (
    <>
      {items.map((item) => {
        const span = clampSpan(getSpan(item), maxSpan)
        return (
          <button
            key={getKey(item)}
            type="button"
            aria-label={getAriaLabel(item)}
            className={buttonClassName}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
            style={{
              gridColumn: `span ${span}`,
              gridRow: `span ${span}`,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: onItemClick ? "pointer" : undefined,
            }}
          >
            {render(item)}
          </button>
        )
      })}
    </>
  )
}
