/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Stack of curated, contextual shelves (Continue / Because you played X / Fresh
 * drops), each a titled row of big-art tiles. The first tile of the first shelf
 * carries the focus highlight. The caller builds the shelf list from data.
 */
import type { PicoGame } from "../../fixtures"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export type Shelf = {
  readonly title: string
  readonly games: readonly PicoGame[]
}

export function ShelfGrid({ shelves }: { readonly shelves: readonly Shelf[] }) {
  return (
    <div className="pcShow-shelves">
      {shelves.map((shelf, row) => (
        <div className="pcShow-shelf" key={shelf.title}>
          <div className="pcShow-shelf-title">{shelf.title}</div>
          <div className="pcShow-shelf-row">
            {shelf.games.map((game, col) => (
              <div
                key={game.id}
                className={`pcShow-tile ${row === 0 && col === 0 ? "on" : ""}`}
              >
                <GameCartUnmarked game={game} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
