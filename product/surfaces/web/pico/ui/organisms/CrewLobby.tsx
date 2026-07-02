/**
 * pico surface. ATOMIC LAYER: organism.
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
      <div
        className="pcMp-crew-marquee"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpCrewMarquee)}
      >
        <span>★ GATHER YOUR CREW ★ GATHER YOUR CREW ★</span>
      </div>
      <div
        className="pcMp-crew-slots"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpCrewSlots)}
      >
        {players.map(player => (
          <div
            key={player.id}
            className={`pcMp-crew-slot p${player.seat} ${player.status}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpCrewSlot)}
          >
            <Player player={player} rep="mascot" />
          </div>
        ))}
      </div>
      <div
        className="pcMp-crew-foot"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpCrewFoot)}
      >
        <Spinner /> 8BITBEN is squeezing in…
      </div>
    </div>
  )
}
