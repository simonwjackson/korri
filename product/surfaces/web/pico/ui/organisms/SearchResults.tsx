/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Search results: matching games as play-able rows. List/Row still come from the
 * kit barrel until they migrate.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Icon } from "../atoms/Icon"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export function SearchResults({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  return (
    <List partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.searchResults)}>
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
