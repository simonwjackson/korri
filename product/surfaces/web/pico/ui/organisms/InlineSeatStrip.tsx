/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The no-hub placement: a home cart rail with a persistent in-session seat strip
 * underneath.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"
import { Player } from "../molecules/Player"

export function InlineSeatStrip({
  games,
  players,
}: {
  readonly games: readonly PicoGame[]
  readonly players: readonly PicoPlayer[]
}) {
  return (
    <div
      className="pcMp-inline"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.inlineSeatStrip)}
    >
      <div className="pcMp-inline-rail">
        {games.slice(0, 5).map((game, index) => (
          <div
            key={game.id}
            className={`pcMp-inline-cart ${index === 1 ? "on" : ""}`}
          >
            <GameCartUnmarked game={game} />
          </div>
        ))}
      </div>
      <div className="pcMp-strip">
        <Dim>IN THIS SESSION</Dim>
        <div className="pcMp-strip-players">
          {players.map(player => (
            <Player key={player.id} player={player} rep="mascot" />
          ))}
        </div>
      </div>
    </div>
  )
}
