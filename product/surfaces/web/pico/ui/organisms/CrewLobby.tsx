/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Playful retro "gather your crew" lobby: a marquee, mascot seat slots, and a
 * waiting footer.
 */
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Spinner } from "../atoms/Spinner"
import { Player } from "../molecules/Player"

export function CrewLobby({
  players,
}: {
  readonly players: readonly PicoPlayer[]
}) {
  return (
    <div
      className="pcMp-crew"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.crewLobby)}
    >
      <div className="pcMp-crew-marquee">
        <span>★ GATHER YOUR CREW ★ GATHER YOUR CREW ★</span>
      </div>
      <div className="pcMp-crew-slots">
        {players.map(player => (
          <div
            key={player.id}
            className={`pcMp-crew-slot p${player.seat} ${player.status}`}
          >
            <Player player={player} rep="mascot" />
          </div>
        ))}
      </div>
      <div className="pcMp-crew-foot">
        <Spinner /> 8BITBEN is squeezing in…
      </div>
    </div>
  )
}
