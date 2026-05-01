import {
  type CSSProperties,
  Fragment,
  type MouseEventHandler,
  type ReactNode,
} from "react"
import { clampSpan, type GridItemShape, useTilegrid } from "../Tilegrid.context"

export interface TilegridCellProps {
  "aria-label": string
  "data-tile-id": string
  type: "button"
  className?: string
  onClick?: MouseEventHandler<HTMLElement>
  style: CSSProperties
}

export interface TilegridRenderCellArgs<T extends GridItemShape> {
  item: T
  cellProps: TilegridCellProps
}

export interface TilegridCellsProps<T extends GridItemShape> {
  /**
   * Function the consumer supplies to render the full cell element. Spread
   * `cellProps` onto a focusable element (typically `<button>`) so spatial
   * navigation, accessibility, click handling, and span styling keep working.
   */
  renderCell: (args: TilegridRenderCellArgs<T>) => ReactNode
  /**
   * Optional click handler. Receives the item, not the DOM event, because
   * spatial-nav engines drive .click() programmatically and consumers care
   * about the item, not the synthetic event.
   */
  onItemClick?: (item: T) => void
  /**
   * Optional className applied to every cell. Keep visual concerns in the
   * consumer's render output; this is for layout-affecting classes only.
   */
  buttonClassName?: string
}

/**
 * The single cell atom for both Tilegrid Roots. Reads items, span resolver,
 * and span limits from context, then asks the consumer to render one cell
 * element per item using the provided cellProps.
 *
 * Spatial navigation reads the rendered cells from the live DOM via LRUD; no
 * focus hooks, refs, or providers are needed here. Consumers should spread
 * cellProps onto a focusable element (typically a native button).
 */
export function TilegridCells<T extends GridItemShape>({
  renderCell,
  onItemClick,
  buttonClassName,
}: TilegridCellsProps<T>) {
  const { base } = useTilegrid<T>()
  const {
    items,
    getKey,
    getSpan,
    getAriaLabel,
    getViewTransitionName,
    maxSpan,
  } = base

  return (
    <>
      {items.map(item => {
        const key = getKey(item)
        const span = clampSpan(getSpan(item), maxSpan)
        const style: CSSProperties = {
          gridColumn: `span ${span}`,
          gridRow: `span ${span}`,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: onItemClick ? "pointer" : undefined,
        }
        const viewTransitionName = getViewTransitionName?.(item)
        if (viewTransitionName !== undefined) {
          style.viewTransitionName = viewTransitionName
        }

        const cellProps: TilegridCellProps = {
          type: "button",
          "aria-label": getAriaLabel(item),
          "data-tile-id": key,
          className: buttonClassName,
          onClick: onItemClick ? () => onItemClick(item) : undefined,
          style,
        }

        return <Fragment key={key}>{renderCell({ item, cellProps })}</Fragment>
      })}
    </>
  )
}
