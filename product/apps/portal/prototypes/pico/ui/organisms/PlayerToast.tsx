/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * "Player joined" toast over the game backdrop.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoPlayer } from "../../fixtures-extra"
import { Player } from "../../screens/kit"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"

export function PlayerToast({
  game,
  players,
}: {
  readonly game: PicoGame | undefined
  readonly players: readonly PicoPlayer[]
}) {
  const joiner = players[2] ?? players[0]
  return (
    <div className="pcMp-toastwrap">
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
