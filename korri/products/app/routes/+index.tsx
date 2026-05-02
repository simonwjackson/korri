import { type GameRecord, getGameImageUrl } from "@shared/fixtures/games/game"
import { games } from "@shared/fixtures/games/games"
import { TilegridCells } from "@shared/primitives/components/Tilegrid/components/TilegridCells"
import { TilegridScrollRoot } from "@shared/primitives/components/Tilegrid/TilegridScrollRoot"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="h-screen w-screen p-4">
      <TilegridScrollRoot<GameRecord>
        items={games}
        cellSize={140}
        gap={8}
        getKey={g => g.id}
        getAriaLabel={g => g.metadata?.name ?? g.id}
      >
        <TilegridCells<GameRecord>
          renderCell={({ cellProps, item }) => (
            <button {...cellProps}>
              <GameTileVisual game={item} />
            </button>
          )}
        />
      </TilegridScrollRoot>
    </div>
  )
}

/**
 * The visual children of one game cell. TilegridCells provides the cell
 * wrapper props; this component renders what goes inside the button.
 */
function GameTileVisual({ game }: { game: GameRecord }) {
  const image = getGameImageUrl(game)
  const name = game.metadata?.name ?? game.id
  return (
    <div className="relative block aspect-square h-full w-full overflow-hidden rounded-lg border border-border bg-neutral-100 dark:bg-neutral-800/50">
      {image ? (
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-500">
          {name}
        </div>
      )}
    </div>
  )
}
