import { TilegridCells } from "@shared/design-system/components/Tilegrid/components/TilegridCells"
import { TilegridScrollRoot } from "@shared/design-system/components/Tilegrid/TilegridScrollRoot"
import { games } from "@shared/themes/shift/fixtures/games"
import {
  type GameRecord,
  getGameImageUrl,
} from "@shared/themes/shift/schemas/game"
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
    <div className="shift-card block h-full w-full">
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
