import { useContainerSize } from "@shared/design-system/lib/useContainerSize"
import { useResolvedCSSLength } from "@shared/design-system/lib/useResolvedCSSLength"
import { Slot } from "radix-ui"
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { paginateItems } from "./layout/bin-pack"
import {
  type GridItemShape,
  type TilegridBaseContext,
  type TilegridPagedExtension,
  TilegridProvider,
} from "./Tilegrid.context"

export interface TilegridPagedRootProps<T extends GridItemShape> {
  /** The full list of items. The Root chunks them into pages. */
  items: ReadonlyArray<T>
  /**
   * Cell base size in CSS pixels (number) or any CSS `<length>` string
   * (`"6rem"`, `"var(--tile-size)"`, `"calc(...)"`, etc.).
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
  /** Aria-label resolver. Default: `item.id`. */
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
   * outer measurement container remains owned by the Root.
   */
  asChild?: boolean
  /**
   * Children typically include a `<TilegridCells renderCell={...} />` plus any
   * sibling page indicators or controls the consumer authors against the
   * paged context (currentPage, totalPages, next, prev, goToPage).
   */
  children: ReactNode
  /**
   * TEST-ONLY override for column count. Bypasses container measurement so
   * happy-dom-based tests can pin layout. Do not use in production code; the
   * underscore prefix marks it as internal.
   */
  _testColumns?: number
  /**
   * TEST-ONLY override for row count. See `_testColumns`.
   */
  _testRows?: number
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
 * Tilegrid Root for paged layout.
 *
 * Measures its container, derives columns + rows from cellSize + gap, runs
 * the bin-packer to chunk items into pages, owns currentPage state, and
 * publishes both the base context (with the *current page's items*) and a
 * paged extension exposing currentPage / totalPages / next / prev / goToPage.
 *
 * `cellSize` and `gap` accept numbers (CSS pixels) or any CSS `<length>`
 * string. String inputs are resolved to pixels live via a hidden sentinel +
 * ResizeObserver, so theme switches, accessibility zoom, and viewport-driven
 * units stay correct without remounting. Numeric inputs are zero-cost — no
 * sentinel, no observer.
 *
 * Stop-at-edge focus is automatic: only the current page's cells are mounted,
 * so the spatial-nav engine finds no neighbor past the page edge and the
 * arrow key becomes a no-op. Page changes are explicit via the extension API.
 *
 * No cycling: next() at the last page and prev() at page 0 are both no-ops.
 */
export function TilegridPagedRoot<T extends GridItemShape>({
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
  _testColumns,
  _testRows,
}: TilegridPagedRootProps<T>) {
  const { ref, width, height } = useContainerSize<HTMLDivElement>()
  const cellSizeMeasure = useResolvedCSSLength(cellSize)
  const gapMeasure = useResolvedCSSLength(gap)

  const cellSizePx = cellSizeMeasure.resolvedPx
  const gapPx = gapMeasure.resolvedPx

  const columns = useMemo(() => {
    if (_testColumns !== undefined) return Math.max(1, Math.floor(_testColumns))
    if (!width || cellSizePx === null || gapPx === null) return 1
    if (cellSizePx <= 0) return 1
    return Math.max(1, Math.floor((width + gapPx) / (cellSizePx + gapPx)))
  }, [_testColumns, width, cellSizePx, gapPx])

  const rows = useMemo(() => {
    if (_testRows !== undefined) return Math.max(1, Math.floor(_testRows))
    if (!height || cellSizePx === null || gapPx === null) return 1
    if (cellSizePx <= 0) return 1
    return Math.max(1, Math.floor((height + gapPx) / (cellSizePx + gapPx)))
  }, [_testRows, height, cellSizePx, gapPx])

  const { pages, totalPages } = useMemo(
    () => paginateItems<T>({ items, columns, rows }),
    [items, columns, rows],
  )

  const [currentPage, setCurrentPage] = useState(0)

  // Clamp currentPage when totalPages shrinks beneath it (e.g., items
  // shortened or layout enlarged).
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1))
    }
  }, [currentPage, totalPages])

  const next = useCallback(() => {
    setCurrentPage(p => Math.min(p + 1, Math.max(0, totalPages - 1)))
  }, [totalPages])

  const prev = useCallback(() => {
    setCurrentPage(p => Math.max(0, p - 1))
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(page, Math.max(0, totalPages - 1))))
    },
    [totalPages],
  )

  const visibleItems = useMemo(
    () => pages[currentPage] ?? [],
    [pages, currentPage],
  )

  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items: visibleItems,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: getSpan ?? ((item: T) => item.span ?? 1),
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      getViewTransitionName,
      cellSize: cellSizePx ?? 0,
      gap: gapPx ?? 0,
      columns,
      maxSpan: { columns, rows },
    }),
    [
      visibleItems,
      getKey,
      getSpan,
      getAriaLabel,
      getViewTransitionName,
      cellSizePx,
      gapPx,
      columns,
      rows,
    ],
  )

  const paged = useMemo<TilegridPagedExtension>(
    () => ({ currentPage, totalPages, next, prev, goToPage }),
    [currentPage, totalPages, next, prev, goToPage],
  )

  const value = useMemo(
    () => ({
      base: base as unknown as TilegridBaseContext<GridItemShape>,
      paged,
    }),
    [base, paged],
  )

  const GridComp = asChild ? Slot.Root : "div"

  const cellSizeIsString = typeof cellSize === "string"
  const gapIsString = typeof gap === "string"

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        // Establishes a containing block so percent-sized sentinels resolve
        // against the paged container rather than the viewport.
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
            gridTemplateRows: `repeat(${rows}, ${cellSizeMeasure.cssValue})`,
            gap: gapMeasure.cssValue,
            gridAutoFlow: "row dense",
            justifyContent: "center",
            alignContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
          {children}
        </GridComp>
      </TilegridProvider>
    </div>
  )
}
