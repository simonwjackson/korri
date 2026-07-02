/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * "Player joined" toast over the game backdrop.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"
import { Player } from "../molecules/Player"

export function PlayerToast({
  game,
  players,
}: {
  readonly game: PicoGame | undefined
  readonly players: readonly PicoPlayer[]
}) {
  const joiner = players[2] ?? players[0]
  return (
    <div
      className="pcMp-toastwrap"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.playerToast)}
    >
      <KeyArtBackdrop src={game?.heroUrl} className="pcMp-backdrop" />
      {joiner ? (
        <div className={`pcMp-toast p${joiner.seat}`}>
          <Player player={{ ...joiner, status: "ready" }} rep="mascot" />
          <div className="pcMp-toast-text">
            <b>
              P{joiner.seat} · {joiner.name}
            </b>
            <span>joined the game</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
