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
  if (viewMode === "list") {
    return (
      <ul className="flex-1 divide-y divide-neutral-300 overflow-y-auto dark:divide-white/10">
        {games.map(game => {
          const name = game.metadata?.name ?? game.id
          const image = getGameImageUrl(game)
          return (
            <li key={game.id}>
              <button
                type="button"
                onClick={() => onGameClick?.(game)}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-neutral-200 dark:hover:bg-white/5"
              >
                <span className="block h-10 w-10 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="text-sm">{name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

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
