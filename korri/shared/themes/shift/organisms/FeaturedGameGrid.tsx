import { useMemo, useState } from "react"
import { useScale } from "../context/ScaleContext"
import { useContainerSize } from "../hooks/useContainerSize"
import { PageDots } from "../molecules/PageDots"
import { type GameRecord, getGameImageUrl } from "../schemas/game"
import {
  type FeaturedGridPage,
  paginateFeaturedGrid,
} from "./featured-grid-pagination"

export interface FeaturedGameGridProps {
  games: ReadonlyArray<GameRecord>
  onGameClick?: (game: GameRecord) => void
  gapPx?: number
}

const DEFAULT_LAYOUT = { columns: 4, rows: 2 }

function calcCount(
  available: number,
  itemSize: number,
  gap: number,
  min: number,
  max: number,
): number {
  if (available <= 0 || itemSize <= 0) return min
  let count = min
  for (let n = min; n <= max; n++) {
    const needed = n * itemSize + (n - 1) * gap
    if (needed <= available) count = n
    else break
  }
  return count
}

export function FeaturedGameGrid({
  games,
  onGameClick,
  gapPx = 6,
}: FeaturedGameGridProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [previousPage, setPreviousPage] = useState(0)
  const { currentScale } = useScale()
  const {
    ref: containerRef,
    width: containerWidth,
    height: containerHeight,
  } = useContainerSize<HTMLDivElement>()

  const layout = useMemo(() => {
    if (!containerWidth || !containerHeight) return DEFAULT_LAYOUT
    const cardW = currentScale.width
    const cardH = currentScale.height
    // Reserve ~28px for pagination dots when there are likely more pages.
    const reservedHeight = games.length > 8 ? 28 : 0
    const columns = calcCount(containerWidth, cardW, gapPx, 2, 8)
    const rows = calcCount(containerHeight - reservedHeight, cardH, gapPx, 2, 6)
    return { columns, rows }
  }, [
    containerWidth,
    containerHeight,
    currentScale.width,
    currentScale.height,
    gapPx,
    games.length,
  ])

  const pagination = useMemo(
    () => paginateFeaturedGrid(games.length, layout),
    [games.length, layout],
  )

  const safePage = Math.min(currentPage, pagination.totalPages - 1)
  const page: FeaturedGridPage = pagination.pages[safePage] ?? {
    featuredIndex: null,
    otherIndices: [],
  }
  const isMovingForward = safePage > previousPage
  const animationClass = isMovingForward
    ? "shift-animate-slide-in-right"
    : "shift-animate-slide-in-left"

  const handlePageChange = (next: number) => {
    setPreviousPage(safePage)
    setCurrentPage(next)
  }

  const featured =
    page.featuredIndex !== null ? games[page.featuredIndex] : null

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-col overflow-hidden"
    >
      <div
        key={safePage}
        className={`grid w-full min-h-0 flex-1 gap-1.5 overflow-hidden ${animationClass}`}
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          gridAutoFlow: "row dense",
        }}
      >
        {featured ? (
          <FeaturedTile
            game={featured}
            onClick={onGameClick ? () => onGameClick(featured) : undefined}
          />
        ) : null}
        {page.otherIndices.map(i => {
          const game = games[i]
          if (!game) return null
          return (
            <Tile
              key={game.id}
              game={game}
              onClick={onGameClick ? () => onGameClick(game) : undefined}
            />
          )
        })}
      </div>
      {pagination.totalPages > 1 ? (
        <PageDots
          total={pagination.totalPages}
          active={safePage}
          onSelect={handlePageChange}
          ariaLabel="Featured grid pages"
        />
      ) : null}
    </div>
  )
}

function FeaturedTile({
  game,
  onClick,
}: {
  game: GameRecord
  onClick?: () => void
}) {
  const image = getGameImageUrl(game)
  const name = game.metadata?.name ?? game.id
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ gridColumn: "span 2", gridRow: "span 2" }}
      className="group relative aspect-square h-full w-full cursor-pointer overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 transition-all duration-200 hover:border-sky-400 dark:border-white/10 dark:bg-neutral-800/50 dark:hover:border-sky-400"
      aria-label={name}
    >
      {image ? (
        <img
          src={image}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="absolute bottom-0 left-0 right-0 translate-y-full p-3 text-white transition-transform duration-200 group-hover:translate-y-0">
        <div className="text-sm font-medium tracking-tight">{name}</div>
      </div>
    </button>
  )
}

function Tile({ game, onClick }: { game: GameRecord; onClick?: () => void }) {
  const image = getGameImageUrl(game)
  const name = game.metadata?.name ?? game.id
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square h-full w-full cursor-pointer overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 transition-all duration-200 hover:border-sky-400 dark:border-white/10 dark:bg-neutral-800/50 dark:hover:border-sky-400"
      aria-label={name}
    >
      {image ? (
        <img
          src={image}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="absolute bottom-0 left-0 right-0 translate-y-full p-2 text-white transition-transform duration-200 group-hover:translate-y-0">
        <div className="text-xs font-medium">{name}</div>
      </div>
    </button>
  )
}
