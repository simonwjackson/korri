import { useContainerSize } from "@shared/design-system/lib/useContainerSize"
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

export interface TilegridScrollRootProps<T extends GridItemShape> {
  /** The full list of items to render. */
  items: ReadonlyArray<T>
  /**
   * Cell base size in CSS pixels (number) or any CSS `<length>` string
   * (`"6rem"`, `"var(--tile-size)"`, `"calc(...)"`, etc.). Every cell
   * occupies an integer multiple of this base size.
   */
  cellSize: number | string
  /**
   * Gap between cells in CSS pixels (number) or any CSS `<length>` string.
   * Default: `8`.
   */
  gap?: number | string
  /** Stable React key extractor. Default: `item.id`. */
  getKey?: (item: T) => string
  /** Span resolver. Default: `item.span ?? 1`. */
  getSpan?: (item: T) => number
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
   * outer scroll container and measurement ref remain owned by the Root.
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
 * Tilegrid Root for continuous scroll layout.
 *
 * Measures its container, derives the column count from cellSize + gap, and
 * publishes a base context. Layout is delegated entirely to CSS:
 * `grid-auto-flow: dense` packs span-marked items first-fit around their
 * neighbors; rows extend as needed by item count.
 *
 * `cellSize` and `gap` accept numbers (CSS pixels) or any CSS `<length>`
 * string. String inputs are resolved to pixels live via a hidden sentinel +
 * ResizeObserver, so theme switches, accessibility zoom, and viewport-driven
 * units stay correct without remounting. Numeric inputs are zero-cost — no
 * sentinel, no observer.
 *
 * The Root owns no pagination state — for that, use TilegridPagedRoot.
 */
export function TilegridScrollRoot<T extends GridItemShape>({
  items,
  cellSize,
  gap = 8,
  getKey,
  getSpan,
  getAriaLabel,
  getViewTransitionName,
  className,
  asChild = false,
  children,
}: TilegridScrollRootProps<T>) {
  const { ref, width } = useContainerSize<HTMLDivElement>()
  const cellSizeMeasure = useResolvedCSSLength(cellSize)
  const gapMeasure = useResolvedCSSLength(gap)

  const cellSizePx = cellSizeMeasure.resolvedPx
  const gapPx = gapMeasure.resolvedPx

  const columns = useMemo(() => {
    if (!width || cellSizePx === null || gapPx === null) return 1
    if (cellSizePx <= 0) return 1
    const raw = Math.floor((width + gapPx) / (cellSizePx + gapPx))
    return Math.max(1, raw)
  }, [width, cellSizePx, gapPx])

  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: getSpan ?? ((item: T) => item.span ?? 1),
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      getViewTransitionName,
      cellSize: cellSizePx ?? 0,
      gap: gapPx ?? 0,
      columns,
      maxSpan: { columns, rows: Infinity },
    }),
    [
      items,
      getKey,
      getSpan,
      getAriaLabel,
      getViewTransitionName,
      cellSizePx,
      gapPx,
      columns,
    ],
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
      ref={ref}
      // Opt this scroll-mode tilegrid into wheel-as-direction. Inside this
      // container the wheel adapter consumes wheel events, accumulates delta,
      // and emits direction actions so the wheel cycles focus tile-by-tile
      // instead of scrolling the page. "2d" means deltaY drives up/down and
      // deltaX drives left/right; horizontal rails (TilegridRailRoot) opt in
      // with "horizontal" instead so vertical wheel motion still moves focus.
      data-pointer-wheel="2d"
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        // Establishes a containing block so percent-sized sentinels resolve
        // against the scroll container rather than the viewport.
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
            gridTemplateColumns: `repeat(${columns}, ${cellSizeMeasure.cssValue})`,
            gridAutoRows: cellSizeMeasure.cssValue,
            gap: gapMeasure.cssValue,
            gridAutoFlow: "row dense",
            justifyContent: "start",
            alignContent: "start",
          }}
        >
          {children}
        </GridComp>
      </TilegridProvider>
    </div>
  )
}
