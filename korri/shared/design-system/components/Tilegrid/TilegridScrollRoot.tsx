import { useContainerSize } from "@shared/design-system/lib/useContainerSize"
import { Slot } from "radix-ui"
import { type ReactNode, useMemo } from "react"
import {
  type GridItemShape,
  type TilegridBaseContext,
  TilegridProvider,
} from "./Tilegrid.context"

export interface TilegridScrollRootProps<T extends GridItemShape> {
  /** The full list of items to render. */
  items: ReadonlyArray<T>
  /** Cell base size in CSS pixels. Every cell occupies an integer multiple of this. */
  cellSize: number
  /** Gap between cells in CSS pixels. Default: 8. */
  gap?: number
  /** Stable React key extractor. Default: `item.id`. */
  getKey?: (item: T) => string
  /** Span resolver. Default: `item.span ?? 1`. */
  getSpan?: (item: T) => number
  /** Aria-label resolver for the cell button. Default: `item.id`. */
  getAriaLabel?: (item: T) => string
  /** Optional className applied to the inner grid container. */
  className?: string
  /**
   * When true, the inner grid container is rendered via Radix Slot so a
   * consumer-provided single child element receives the grid styles. The
   * outer scroll container and measurement ref remain owned by the Root.
   */
  asChild?: boolean
  /**
   * Children are typically a `<TilegridCells render={...} />` plus any
   * sibling overlays the consumer wants composed alongside the cells.
   */
  children: ReactNode
}

/**
 * Tilegrid Root for continuous scroll layout.
 *
 * Measures its container, derives the column count from cellSize + gap, and
 * publishes a base context. Layout is delegated entirely to CSS:
 * `grid-auto-flow: dense` packs span-marked items first-fit around their
 * neighbors; rows extend as needed by item count.
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
  className,
  asChild = false,
  children,
}: TilegridScrollRootProps<T>) {
  const { ref, width } = useContainerSize<HTMLDivElement>()

  const columns = useMemo(() => {
    if (!width || cellSize <= 0) return 1
    const raw = Math.floor((width + gap) / (cellSize + gap))
    return Math.max(1, raw)
  }, [width, cellSize, gap])

  const base = useMemo<TilegridBaseContext<T>>(
    () => ({
      items,
      getKey: getKey ?? ((item: T) => item.id),
      getSpan: getSpan ?? ((item: T) => item.span ?? 1),
      getAriaLabel: getAriaLabel ?? ((item: T) => item.id),
      cellSize,
      gap,
      columns,
      maxSpan: { columns, rows: Infinity },
    }),
    [items, getKey, getSpan, getAriaLabel, cellSize, gap, columns],
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
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <TilegridProvider value={value}>
        <GridComp
          className={className}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
            gap: `${gap}px`,
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
