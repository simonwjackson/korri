/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Stack of curated, contextual shelves (Continue / Because you played X / Fresh
 * drops), each a titled row of big-art tiles. The first tile of the first shelf
 * carries the focus highlight. The caller builds the shelf list from data.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export type Shelf = {
  readonly title: string
  readonly games: readonly PicoGame[]
}

export function ShelfGrid({ shelves }: { readonly shelves: readonly Shelf[] }) {
  return (
    <div
      className="pcShow-shelves"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.shelfGrid)}
    >
      {shelves.map((shelf, row) => (
        <div
          className="pcShow-shelf"
          key={shelf.title}
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowShelf)}
        >
          <div
            className="pcShow-shelf-title"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowShelfTitle)}
          >
            {shelf.title}
          </div>
          <div
            className="pcShow-shelf-row"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowShelfRow)}
          >
            {shelf.games.map((game, col) => (
              <div
                key={game.id}
                className={`pcShow-tile ${row === 0 && col === 0 ? "on" : ""}`}
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowTile)}
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
