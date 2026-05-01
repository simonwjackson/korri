import { Slot } from "radix-ui"
import { type ReactNode, useMemo } from "react"
import {
  type GridItemShape,
  type TilegridBaseContext,
  TilegridProvider,
} from "./Tilegrid.context"

export interface TilegridRailRootProps<T extends GridItemShape> {
  /** The full list of items to render in a single horizontal row. */
  items: ReadonlyArray<T>
  /** Cell size in CSS pixels. Cells are square and uniform. */
  cellSize: number
  /** Gap between cells in CSS pixels. Default: 8. */
  gap?: number
  /** Stable React key extractor. Default: `item.id`. */
  getKey?: (item: T) => string
  /** Aria-label resolver for the cell element. Default: `item.id`. */
  getAriaLabel?: (item: T) => string
  /**
   * Optional View Transitions API name resolver. Tilegrid applies the
   * returned name to each cell; consumers own document.startViewTransition.
   */
  getViewTransitionName?: (item: T) => string
  /** Optional className applied to the inner grid container. */
  className?: string
  /**
   * When true, the inner grid container is rendered via Radix Slot so a
   * consumer-provided single child element receives the grid styles. The
   * outer scroll container remains owned by the Root.
   */
  asChild?: boolean
  /**
   * Children are typically a `<TilegridCells renderCell={...} />` plus any
   * sibling overlays the consumer wants composed alongside the cells.
   */
  children: ReactNode
}

/**
 * Tilegrid Root for a single horizontal row (Switch / Apple TV / Netflix
 * "rail" pattern).
 *
 * Items are laid out left-to-right in one row of equally sized cells with
 * horizontal scroll. Spans are clamped to 1×1 — rail mode treats every tile
 * as a single cell. Spatial navigation works because LRUD is geometric, and
 * the browser auto-scrolls focused cells into view.
 *
 * No layout measurement is performed: the row width is determined by the
 * number of items, not the container. For paged or vertical layouts use
 * TilegridPagedRoot or TilegridScrollRoot instead.
 */
export function TilegridRailRoot<T extends GridItemShape>({
  items,
  cellSize,
  gap = 8,
  getKey,
  getAriaLabel,
  getViewTransitionName,
  className,
  asChild = false,
  children,
}: TilegridRailRootProps<T>) {
  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: () => 1,
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      getViewTransitionName,
      cellSize,
      gap,
      // `columns` is informational in rail mode; the row simply grows with
      // the number of items. Use items.length so consumers reading context
      // see a meaningful value.
      columns: Math.max(1, items.length),
      maxSpan: { columns: 1, rows: 1 },
    }),
    [items, getKey, getAriaLabel, getViewTransitionName, cellSize, gap],
  )

  // Cast the typed context to the unknown-itemed shape the React context
  // stores at runtime. useTilegrid<T>() reverses this on read.
  const value = useMemo(
    () => ({
      base: base as unknown as TilegridBaseContext<GridItemShape>,
      paged: undefined,
    }),
    [base],
  )

  const GridComp = asChild ? Slot.Root : "div"

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      <TilegridProvider value={value}>
        <GridComp
          className={className}
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: `${cellSize}px`,
            gridTemplateRows: `${cellSize}px`,
            gap: `${gap}px`,
            alignContent: "center",
            justifyContent: "start",
            width: "fit-content",
          }}
        >
          {children}
        </GridComp>
      </TilegridProvider>
    </div>
  )
}
