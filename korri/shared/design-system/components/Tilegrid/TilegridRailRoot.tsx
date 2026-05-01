import { useResolvedCSSLength } from "@shared/design-system/lib/useResolvedCSSLength"
import { centerScrollableAncestors } from "@shared/navigation/center-scroll"
import { Slot } from "radix-ui"
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type GridItemShape,
  type TilegridBaseContext,
  TilegridProvider,
} from "./Tilegrid.context"

/** Rectangular cell-size shape: separate column-width and row-height. */
export interface TilegridRailRectCellSize {
  width: number | string
  height: number | string
}

export interface TilegridRailRootProps<T extends GridItemShape> {
  /** The full list of items to render in a single horizontal row. */
  items: ReadonlyArray<T>
  /**
   * Cell size.
   *
   * - `number` or CSS `<length>` string (`"6rem"`, `"var(--tile-size)"`,
   *   `"calc(...)"`, etc.) — cells are square and uniform.
   * - `{ width, height }` — cells are rectangular at the Root level. Each
   *   axis independently accepts a number or any CSS `<length>` string.
   *   Use this for the Switch/Apple TV style rail of mixed landscape +
   *   portrait tiles, all sharing the same row height.
   *
   * Numeric inputs are zero-cost. String inputs are resolved live via the
   * sentinel + ResizeObserver mechanism in `useResolvedCSSLength`.
   */
  cellSize: number | string | TilegridRailRectCellSize
  /**
   * Gap between cells in CSS pixels (number) or any CSS `<length>` string.
   * Default: `8`.
   */
  gap?: number | string
  /** Stable React key extractor. Default: `item.id`. */
  getKey?: (item: T) => string
  /**
   * Span resolver. Default: `item.span ?? 1`.
   *
   * In rail mode the span applies only to the column axis — the row axis
   * is always 1, regardless of the resolved span value. A tile with span N
   * occupies N column-widths plus (N-1) gap-widths in the rail's single
   * row. Spans are clamped to `items.length` (a tile cannot span more
   * columns than the rail has cells).
   */
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
 * Items are laid out left-to-right in one row, scrolling horizontally.
 * Cells may be square (single `cellSize`) or rectangular (`{ width, height }`)
 * for landscape-feature-tile-plus-portrait-poster designs.
 *
 * Items may declare `span: N` to occupy N column-widths plus (N-1) gap-widths
 * in the same row, while staying in the rail's single row — useful for a
 * wide "feature" tile alongside narrower covers. Spans are clamped to
 * `items.length` and the row axis is pinned to 1 by `TilegridCells` reading
 * the `spanAxis: "column-only"` flag this Root publishes.
 *
 * Spatial navigation works because LRUD is geometric, and the browser
 * auto-scrolls focused cells into view.
 *
 * `cellSize` (or each axis of `cellSize` when rectangular) and `gap` accept
 * numbers or any CSS `<length>` string. String inputs are resolved to pixels
 * live via a hidden sentinel + ResizeObserver, so theme switches,
 * accessibility zoom, and viewport-driven units stay correct without
 * remounting. Numeric inputs are zero-cost — no sentinel, no observer.
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
  getSpan,
  getAriaLabel,
  getViewTransitionName,
  className,
  asChild = false,
  children,
}: TilegridRailRootProps<T>) {
  // Rectangular cellSize is the discriminated object form. Resolve each axis
  // independently so numeric dimensions stay zero-cost while string dimensions
  // each get their own sentinel + ResizeObserver.
  const isRectCellSize = typeof cellSize === "object" && cellSize !== null
  const widthInput: number | string = isRectCellSize ? cellSize.width : cellSize
  const heightInput: number | string = isRectCellSize
    ? cellSize.height
    : cellSize

  const widthMeasure = useResolvedCSSLength(widthInput)
  const heightMeasure = useResolvedCSSLength(heightInput)
  const gapMeasure = useResolvedCSSLength(gap)

  const widthPx = widthMeasure.resolvedPx ?? 0
  const heightPx = heightMeasure.resolvedPx ?? 0
  const gapPx = gapMeasure.resolvedPx ?? 0

  // Natural width = sum of cell widths * effective span + gaps. Effective
  // span mirrors clampSpan in rail mode: span > items.length is impossible
  // so any item's effective span is min(items.length, max(1, span)). We
  // compute this from items + spans + cellSize + gap (all already known)
  // rather than reading scrollWidth, which would double-count once the
  // overflow padding gets applied.
  const getSpanFn = getSpan ?? ((item: T) => item.span ?? 1)
  const naturalWidthPx = useMemo(() => {
    if (widthPx <= 0 || items.length === 0) return 0
    const ceiling = Math.max(1, items.length)
    const sumSpans = items.reduce((acc, item) => {
      const raw = Math.max(1, getSpanFn(item))
      return acc + Math.min(raw, ceiling)
    }, 0)
    return sumSpans * widthPx + Math.max(0, sumSpans - 1) * gapPx
  }, [items, widthPx, gapPx, getSpanFn])

  // Outer scroll container ref. Used to measure clientWidth (overflow check)
  // and as the focus-containment scope for initial-focus snap.
  const outerRef = useRef<HTMLDivElement | null>(null)
  const [overflows, setOverflows] = useState(false)

  // ResizeObserver: toggle overflow flag. Runs in useLayoutEffect so the
  // first measurement applies before paint, avoiding a one-frame layout
  // flicker between "no padding" and "padding".
  useLayoutEffect(() => {
    const node = outerRef.current
    if (!node) return
    const update = () => {
      const next = naturalWidthPx > 0 && naturalWidthPx > node.clientWidth
      setOverflows(prev => (prev === next ? prev : next))
    }
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [naturalWidthPx])

  // Snap-to-centered when the overflow flag changes (window resize, item
  // count change, theme switch). Synchronous so the user does not see a
  // mid-flight scroll between "padding off" and "padding on". The early
  // return on !overflows is also what reads `overflows` in the body so the
  // exhaustive-deps rule treats it as a real dependency rather than a
  // re-run trigger — either way, calling the util when the surface is not
  // overflowing would be a no-op.
  useLayoutEffect(() => {
    if (!overflows) return
    const node = outerRef.current
    if (!node) return
    const active = document.activeElement
    if (active instanceof HTMLElement && node.contains(active)) {
      centerScrollableAncestors(active, { animate: false })
    }
  }, [overflows])

  // Initial-focus snap (R13): consumer's mount-time `.focus()` calls run in
  // their own useEffect, which fires AFTER this Root's useEffect. Defer one
  // frame so we observe document.activeElement after the consumer's call.
  // Idempotent with the overflow-change snap above; the util collapses
  // duplicate calls to a single sync write.
  useEffect(() => {
    const node = outerRef.current
    if (!node) return
    const handle = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active instanceof HTMLElement && node.contains(active)) {
        centerScrollableAncestors(active, { animate: false })
      }
    })
    return () => cancelAnimationFrame(handle)
  }, [])

  // For square inputs (number/string), width and height share one resolution
  // and one sentinel; only the rectangular path emits two sentinels.
  const widthCss = widthMeasure.cssValue
  const heightCss = isRectCellSize
    ? heightMeasure.cssValue
    : widthMeasure.cssValue

  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: getSpan ?? ((item: T) => item.span ?? 1),
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      getViewTransitionName,
      // `cellSize` stays populated as the column-width even in rectangular
      // mode (where `cellSizeRect.width === cellSize`) so legacy consumers
      // reading the scalar field keep working.
      cellSize: widthPx,
      // Construct cellSizeRect inside the memo so the dependency list stays
      // primitive (widthPx, heightPx, isRectCellSize) — building it outside
      // would force a new object on every render and re-trigger the memo.
      cellSizeRect: isRectCellSize
        ? { width: widthPx, height: heightPx }
        : undefined,
      gap: gapPx,
      // `columns` is informational in rail mode; the row simply grows with
      // the number of items. Use items.length so consumers reading context
      // see a meaningful value, and so it doubles as the per-tile column-span
      // upper bound.
      columns: Math.max(1, items.length),
      // The column upper bound is the number of cells in the rail. The row
      // axis is unbounded by clampSpan because the row-axis pin to 1 lives
      // in TilegridCells (gated by spanAxis: "column-only" below) rather
      // than in clampSpan's scalar contract.
      maxSpan: {
        columns: Math.max(1, items.length),
        rows: Number.POSITIVE_INFINITY,
      },
      spanAxis: "column-only",
    }),
    [
      items,
      getKey,
      getSpan,
      getAriaLabel,
      getViewTransitionName,
      widthPx,
      heightPx,
      gapPx,
      isRectCellSize,
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

  // Sentinel rendering rules:
  //   - Square (string) cellSize → one shared `cell-size` sentinel for both axes.
  //   - Rectangular cellSize → one `cell-size-width` and/or `cell-size-height`
  //     sentinel per dimension that is a string (numeric dimensions are
  //     zero-cost and skip their sentinel entirely).
  const showSquareSentinel = !isRectCellSize && typeof cellSize === "string"
  const showWidthSentinel = isRectCellSize && typeof widthInput === "string"
  const showHeightSentinel = isRectCellSize && typeof heightInput === "string"
  const gapIsString = typeof gap === "string"

  return (
    <div
      ref={outerRef}
      // Opt this rail into wheel-as-direction with horizontal axis mapping.
      // Vertical wheel motion (deltaY) translates to left/right — desktop
      // carousel convention so a horizontal rail does not require
      // shift+scroll to navigate via the wheel.
      data-pointer-wheel="horizontal"
      // Opt into Mario-camera scrolling: focused tile centers on the
      // inline axis when content overflows. The focus engine and the
      // centering util both walk up looking for this attribute.
      data-mario-camera="inline"
      // data-mario-overflows mirrors the overflow flag so CSS / tests can
      // assert layout state without measuring scrollWidth.
      data-mario-overflows={overflows ? "true" : undefined}
      style={
        {
          width: "100%",
          height: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          // Establishes a containing block so percent-sized sentinels resolve
          // against the rail rather than the viewport. Also doubles as the
          // container-query containment context: cqi inside the inner grid
          // resolves against this element's inline size.
          position: "relative",
          containerType: "inline-size",
          // Mario edge padding reads this custom property so the same CSS
          // expression works for both numeric and CSS-string cellSize inputs.
          ["--mario-cell-size" as string]: widthCss,
        } as CSSProperties
      }
    >
      {showSquareSentinel && (
        <span
          ref={widthMeasure.ref as RefObject<HTMLSpanElement>}
          aria-hidden="true"
          data-tilegrid-sentinel="cell-size"
          style={{ ...SENTINEL_STYLE, width: widthMeasure.cssValue }}
        />
      )}
      {showWidthSentinel && (
        <span
          ref={widthMeasure.ref as RefObject<HTMLSpanElement>}
          aria-hidden="true"
          data-tilegrid-sentinel="cell-size-width"
          style={{ ...SENTINEL_STYLE, width: widthMeasure.cssValue }}
        />
      )}
      {showHeightSentinel && (
        <span
          ref={heightMeasure.ref as RefObject<HTMLSpanElement>}
          aria-hidden="true"
          data-tilegrid-sentinel="cell-size-height"
          // The sentinel measures its own width regardless of which axis it
          // tracks; sizing it to the height value lets useResolvedCSSLength
          // resolve the CSS expression through the same path.
          style={{ ...SENTINEL_STYLE, width: heightMeasure.cssValue }}
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
            gridAutoColumns: widthCss,
            gridTemplateRows: heightCss,
            gap: gapMeasure.cssValue,
            alignContent: "center",
            justifyContent: "start",
            width: "fit-content",
            // Edge padding allows tile #1 and tile #N to scroll-center.
            // Only applied when natural content overflows the container,
            // so non-overflowing rails do not gain spurious scroll room
            // and never trigger focus-driven scroll on direction moves.
            paddingInline: overflows
              ? "max(0px, calc(50cqi - var(--mario-cell-size) / 2))"
              : 0,
          }}
        >
          {children}
        </GridComp>
      </TilegridProvider>
    </div>
  )
}
