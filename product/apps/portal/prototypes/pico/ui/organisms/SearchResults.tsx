/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Search results: matching games as play-able rows. List/Row still come from the
 * kit barrel until they migrate.
 */
import type { PicoGame } from "../../fixtures"
import { List, Row } from "../../screens/kit"
import { Icon } from "../atoms/Icon"

export function SearchResults({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  return (
    <List>
      {games.map(game => (
        <Row
          key={game.id}
          icon={<Icon name="play" />}
          label={game.title}
          meta={game.genre}
        />
      ))}
    </List>
  )
}
