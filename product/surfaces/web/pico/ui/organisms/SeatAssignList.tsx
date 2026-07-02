/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Seat & controller assignment: per-seat cards with the player rep, controller,
 * and a swap / press-start action.
 */
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"
import { Icon } from "../atoms/Icon"
import { Card } from "../molecules/Card"
import { Player } from "../molecules/Player"

export function SeatAssignList({
  players,
}: {
  readonly players: readonly PicoPlayer[]
}) {
  return (
    <div
      className="pcMp-assign"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.seatAssignList)}
    >
      {players.map(player => (
        <Card key={player.id} className={`pcMp-assign-row p${player.seat}`}>
          <span className="pcMp-assign-seat">P{player.seat}</span>
          <Player player={player} rep="mascot" />
          <div className="pcMp-assign-ctrl">
            <Icon name="pad" />
            <Dim>{player.controller}</Dim>
          </div>
          <span className="pcMp-assign-act">
            {player.status === "open" ? "PRESS START" : "SWAP"}
          </span>
        </Card>
      ))}
    </div>
  )
}
