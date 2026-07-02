/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Continue-playing list: recent games as rows with a cart thumbnail, last-played
 * meta, and playtime, first row selected. Leaf atoms (List/Row/Dim) still come
 * from the kit barrel until they migrate.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export function ContinueList({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  return (
    <List partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.continueList)}>
      {games.map((game, index) => (
        <Row
          key={game.id}
          icon={<GameCartUnmarked game={game} />}
          label={game.title}
          meta={
            game.lastPlayedLabel
              ? `LAST PLAYED ${game.lastPlayedLabel}`
              : "RESUME"
          }
          trailing={<Dim>{game.playtimeLabel ?? "—"}</Dim>}
          state={index === 0 ? "selected" : "default"}
        />
      ))}
    </List>
  )
}
