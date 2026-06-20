/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Continue-playing list: recent games as rows with a cart thumbnail, last-played
 * meta, and playtime, first row selected. Leaf atoms (List/Row/Dim) still come
 * from the kit barrel until they migrate.
 */
import type { PicoGame } from "../../fixtures"
import { Dim } from "../atoms/Dim"
import { GameCart } from "../molecules/GameCart"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export function ContinueList({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  return (
    <List>
      {games.map((game, index) => (
        <Row
          key={game.id}
          icon={<GameCart game={game} showFav={false} />}
          label={game.title}
          meta={
            game.lastPlayedLabel
              ? `LAST PLAYED ${game.lastPlayedLabel}`
              : "RESUME"
          }
          trailing={<Dim>{game.playtimeLabel ?? "—"}</Dim>}
          sel={index === 0}
        />
      ))}
    </List>
  )
}
