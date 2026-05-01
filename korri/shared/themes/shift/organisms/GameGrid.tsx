import { Card } from "../atoms/Card"
import type { ViewMode } from "../fixtures/nav"
import { type GameRecord, getGameImageUrl } from "../schemas/game"
import { FeaturedGameGrid } from "./FeaturedGameGrid"

export interface GameGridProps {
  games: ReadonlyArray<GameRecord>
  viewMode: ViewMode
  onGameClick?: (game: GameRecord) => void
}

export function GameGrid({ games, viewMode, onGameClick }: GameGridProps) {
  if (viewMode === "featured") {
    return (
      <div className="flex flex-1 flex-col justify-center overflow-hidden px-6 py-4">
        <FeaturedGameGrid games={games} onGameClick={onGameClick} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-1">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {games.map(game => {
          const name = game.metadata?.name ?? game.id
          return (
            <Card
              key={game.id}
              imageUrl={getGameImageUrl(game)}
              alt={name}
              ariaLabel={name}
              onClick={() => onGameClick?.(game)}
            />
          )
        })}
      </div>
    </div>
  )
}
