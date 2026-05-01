import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { useContainerSize } from "@shared/themes/shift/hooks/useContainerSize"
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
  /** Cell base size in CSS pixels. */
  cellSize: number
  /** Gap between cells in CSS pixels. Default: 8. */
  gap?: number
  /** Stable React key extractor. Default: `item.id`. */
  getKey?: (item: T) => string
  /** Span resolver. Default: `item.span ?? 1`. */
  getSpan?: (item: T) => number
  /** Aria-label resolver. Default: `item.id`. */
  getAriaLabel?: (item: T) => string
  /** Optional className applied to the inner grid container. */
  className?: string
  /**
   * Children typically include a `<TilegridCells render={...} />` plus any
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

/**
 * Tilegrid Root for paged layout.
 *
 * Measures its container, derives columns + rows from cellSize + gap, runs
 * the bin-packer to chunk items into pages, owns currentPage state, and
 * publishes both the base context (with the *current page's items*) and a
 * paged extension exposing currentPage / totalPages / next / prev / goToPage.
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
  className,
  children,
  _testColumns,
  _testRows,
}: TilegridPagedRootProps<T>) {
  const { ref, width, height } = useContainerSize<HTMLDivElement>()

  const columns = useMemo(() => {
    if (_testColumns !== undefined) return Math.max(1, Math.floor(_testColumns))
    if (!width || cellSize <= 0) return 1
    return Math.max(1, Math.floor((width + gap) / (cellSize + gap)))
  }, [_testColumns, width, cellSize, gap])

  const rows = useMemo(() => {
    if (_testRows !== undefined) return Math.max(1, Math.floor(_testRows))
    if (!height || cellSize <= 0) return 1
    return Math.max(1, Math.floor((height + gap) / (cellSize + gap)))
  }, [_testRows, height, cellSize, gap])

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
    setCurrentPage((p) => Math.min(p + 1, Math.max(0, totalPages - 1)))
  }, [totalPages])

  const prev = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1))
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(page, Math.max(0, totalPages - 1))))
    },
    [totalPages],
  )

  const visibleItems = useMemo(() => pages[currentPage] ?? [], [pages, currentPage])

  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items: visibleItems,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: getSpan ?? ((item: T) => item.span ?? 1),
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      cellSize,
      gap,
      columns,
      maxSpan: { columns, rows },
    }),
    [visibleItems, getKey, getSpan, getAriaLabel, cellSize, gap, columns, rows],
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

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          gap: `${gap}px`,
          gridAutoFlow: "row dense",
          justifyContent: "center",
          alignContent: "center",
          width: "100%",
          height: "100%",
        }}
      >
        <TilegridProvider value={value}>{children}</TilegridProvider>
      </div>
    </div>
  )
}
