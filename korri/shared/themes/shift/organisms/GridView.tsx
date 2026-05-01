import { AnimatePresence, motion } from "framer-motion"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { type GridItemShape, paginateItems } from "./grid-view-pagination"

export interface GridItem extends GridItemShape {
  id: string
  image: string
  metadata?: Record<string, unknown>
  span?: number
}

export type TransitionType = "fade" | "slide"
export type GridFlow = "row" | "column" | "row-reverse" | "column-reverse"

export interface GridViewProps {
  items: ReadonlyArray<GridItem>
  onItemClick?: (item: GridItem) => void
  minItemSize?: number
  itemScale?: number
  gap?: number
  maxColumns?: number
  maxRows?: number
  cycle?: boolean
  className?: string
  transitionType?: TransitionType
  gridFlow?: GridFlow
}

export interface GridViewHandle {
  next: () => void
  prev: () => void
  goToPage: (page: number) => void
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export const GridView = forwardRef<GridViewHandle, GridViewProps>(
  function GridView(props, ref) {
    const {
      items,
      onItemClick,
      minItemSize = 50,
      itemScale = 1,
      gap = 16,
      maxColumns,
      maxRows,
      cycle = true,
      className,
      transitionType = "slide",
      gridFlow = "row",
    } = props

    const effectiveItemSize = minItemSize * itemScale
    const containerRef = useRef<HTMLDivElement | null>(null)

    const [dimensions, setDimensions] = useState({ columns: 0, rows: 0 })
    const [currentPage, setCurrentPage] = useState(0)

    useIsoLayoutEffect(() => {
      const node = containerRef.current
      if (!node) return

      const compute = (width: number, height: number) => {
        const rawCols = Math.floor(width / (effectiveItemSize + gap))
        const rawRows = Math.floor(height / (effectiveItemSize + gap))
        const columns = Math.max(
          1,
          Math.min(rawCols, maxColumns ?? Number.POSITIVE_INFINITY),
        )
        const rows = Math.max(
          1,
          Math.min(rawRows, maxRows ?? Number.POSITIVE_INFINITY),
        )
        setDimensions({ columns, rows })
      }

      const rect = node.getBoundingClientRect()
      compute(rect.width, rect.height)

      const observer = new ResizeObserver(entries => {
        const first = entries[0]
        if (!first) return
        compute(first.contentRect.width, first.contentRect.height)
      })
      observer.observe(node)
      return () => observer.disconnect()
    }, [effectiveItemSize, gap, maxColumns, maxRows])

    const { pages, totalPages } = useMemo(
      () =>
        paginateItems<GridItem>({
          items,
          columns: dimensions.columns,
          rows: dimensions.rows,
        }),
      [items, dimensions.columns, dimensions.rows],
    )

    useEffect(() => {
      if (currentPage >= totalPages) {
        setCurrentPage(Math.max(0, totalPages - 1))
      }
    }, [totalPages, currentPage])

    useImperativeHandle(
      ref,
      () => ({
        next: () => {
          if (cycle && currentPage === totalPages - 1) {
            setCurrentPage(0)
          } else {
            setCurrentPage(p => Math.min(p + 1, totalPages - 1))
          }
        },
        prev: () => {
          if (cycle && currentPage === 0) {
            setCurrentPage(totalPages - 1)
          } else {
            setCurrentPage(p => Math.max(p - 1, 0))
          }
        },
        goToPage: (page: number) =>
          setCurrentPage(Math.max(0, Math.min(page, totalPages - 1))),
        currentPage,
        totalPages,
        hasNext: cycle || currentPage < totalPages - 1,
        hasPrev: cycle || currentPage > 0,
      }),
      [currentPage, totalPages, cycle],
    )

    const visibleItems = pages[currentPage] ?? []
    const isColumnFlow = gridFlow === "column" || gridFlow === "column-reverse"
    const isReversed =
      gridFlow === "row-reverse" || gridFlow === "column-reverse"

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: isColumnFlow
            ? `repeat(auto-fit, ${effectiveItemSize}px)`
            : dimensions.columns > 0
              ? `repeat(${dimensions.columns}, ${effectiveItemSize}px)`
              : `repeat(auto-fill, ${effectiveItemSize}px)`,
          gridTemplateRows: isColumnFlow
            ? dimensions.rows > 0
              ? `repeat(${dimensions.rows}, ${effectiveItemSize}px)`
              : `repeat(auto-fill, ${effectiveItemSize}px)`
            : `repeat(auto-fit, ${effectiveItemSize}px)`,
          gap: `${gap}px`,
          gridAutoFlow: isColumnFlow ? "column" : "row",
          justifyContent: "center",
          alignContent: "center",
          direction: isReversed ? "rtl" : "ltr",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div key={currentPage} style={{ display: "contents" }}>
            {visibleItems.map((item, index) => {
              const span = Math.max(1, Math.floor(item.span ?? 1))
              const itemSize = effectiveItemSize * span + gap * (span - 1)
              return (
                <GridItemTile
                  key={item.id}
                  item={item}
                  index={index}
                  itemSize={itemSize}
                  span={span}
                  transitionType={transitionType}
                  onItemClick={onItemClick}
                />
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  },
)

interface GridItemTileProps {
  item: GridItem
  index: number
  itemSize: number
  span: number
  transitionType: TransitionType
  onItemClick?: (item: GridItem) => void
}

/**
 * Native <button> tile. Spatial navigation is handled by the global focus
 * engine reading the live DOM — no useFocusable, no refs, no provider here.
 * The :focus-visible ring comes from shift.css and applies for keyboard,
 * gamepad, and remote input alike.
 */
function GridItemTile({
  item,
  index,
  itemSize,
  span,
  transitionType,
  onItemClick,
}: GridItemTileProps) {
  const initial =
    transitionType === "fade"
      ? { opacity: 0, scale: 0.8 }
      : { opacity: 0, x: 100 }
  const animate =
    transitionType === "fade"
      ? {
          opacity: 1,
          scale: 1,
          transition: {
            duration: 0.3,
            delay: index * 0.02,
            ease: [0.43, 0.13, 0.23, 0.96] as [number, number, number, number],
          },
        }
      : {
          opacity: 1,
          x: 0,
          transition: {
            duration: 0.3,
            delay: index * 0.05,
            ease: "easeInOut" as const,
          },
        }
  const exit =
    transitionType === "fade"
      ? { opacity: 0, scale: 0.8 }
      : { opacity: 0, x: -100 }

  return (
    <motion.button
      type="button"
      aria-label={typeof item.id === "string" ? item.id : undefined}
      initial={initial}
      animate={animate}
      exit={exit}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onItemClick?.(item)}
      style={{
        gridColumn: `span ${span}`,
        gridRow: `span ${span}`,
        width: itemSize,
        height: itemSize,
        cursor: "pointer",
        overflow: "hidden",
        borderRadius: "8px",
        backgroundColor: "#f0f0f0",
        position: "relative",
        padding: 0,
        border: "none",
      }}
    >
      <img
        src={item.image}
        alt=""
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </motion.button>
  )
}
