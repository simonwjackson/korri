import { useResolvedCSSLength } from "@shared/design-system/lib/useResolvedCSSLength"
import { Slot } from "radix-ui"
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useMemo,
} from "react"
import {
  type GridItemShape,
  type TilegridBaseContext,
  TilegridProvider,
} from "./Tilegrid.context"

export interface TilegridRailRootProps<T extends GridItemShape> {
  /** The full list of items to render in a single horizontal row. */
  items: ReadonlyArray<T>
  /**
   * Cell size in CSS pixels (number) or any CSS `<length>` string
   * (`"6rem"`, `"var(--tile-size)"`, `"calc(...)"`, etc.). Cells are
   * square and uniform.
   */
  cellSize: number | string
  /**
   * Gap between cells in CSS pixels (number) or any CSS `<length>` string.
   * Default: `8`.
   */
  gap?: number | string
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

/** Sentinel style: invisible, zero-height, no pointer interaction. */
const SENTINEL_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  height: 0,
  visibility: "hidden",
  pointerEvents: "none",
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
 * `cellSize` and `gap` accept numbers (CSS pixels) or any CSS `<length>`
 * string. String inputs are resolved to pixels live via a hidden sentinel +
 * ResizeObserver, so theme switches, accessibility zoom, and viewport-driven
 * units stay correct without remounting. Numeric inputs are zero-cost — no
 * sentinel, no observer.
 *
 * No layout measurement of the outer container is performed: the row width
 * is determined by the number of items, not the container. For paged or
 * vertical layouts use TilegridPagedRoot or TilegridScrollRoot instead.
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
  const cellSizeMeasure = useResolvedCSSLength(cellSize)
  const gapMeasure = useResolvedCSSLength(gap)

  const cellSizePx = cellSizeMeasure.resolvedPx ?? 0
  const gapPx = gapMeasure.resolvedPx ?? 0

  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: () => 1,
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      getViewTransitionName,
      cellSize: cellSizePx,
      gap: gapPx,
      // `columns` is informational in rail mode; the row simply grows with
      // the number of items. Use items.length so consumers reading context
      // see a meaningful value.
      columns: Math.max(1, items.length),
      maxSpan: { columns: 1, rows: 1 },
    }),
    [items, getKey, getAriaLabel, getViewTransitionName, cellSizePx, gapPx],
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

  const cellSizeIsString = typeof cellSize === "string"
  const gapIsString = typeof gap === "string"

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        // Establishes a containing block so percent-sized sentinels resolve
        // against the rail rather than the viewport.
        position: "relative",
      }}
    >
      {cellSizeIsString && (
        <span
          ref={cellSizeMeasure.ref as RefObject<HTMLSpanElement>}
          aria-hidden="true"
          data-tilegrid-sentinel="cell-size"
          style={{ ...SENTINEL_STYLE, width: cellSizeMeasure.cssValue }}
        />
      )}
      {gapIsString && (
        <span
          ref={gapMeasure.ref as RefObject<HTMLSpanElement>}
          aria-hidden="true"
          data-tilegrid-sentinel="gap"
          style={{ ...SENTINEL_STYLE, width: gapMeasure.cssValue }}
        />
      )}
      <TilegridProvider value={value}>
        <GridComp
          className={className}
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: cellSizeMeasure.cssValue,
            gridTemplateRows: cellSizeMeasure.cssValue,
            gap: gapMeasure.cssValue,
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
