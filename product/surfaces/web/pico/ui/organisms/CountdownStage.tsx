/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Ready & countdown: backdrop, big number, and the ready players.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"
import { Title } from "../atoms/Title"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"
import { Player } from "../molecules/Player"

export function CountdownStage({
  game,
  players,
}: {
  readonly game: PicoGame | undefined
  readonly players: readonly PicoPlayer[]
}) {
  const active = players.filter(player => player.status !== "open")
  return (
    <div
      className="pcMp-count"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.countdownStage)}
    >
      <KeyArtBackdrop src={game?.heroUrl} className="pcMp-backdrop" />
      <div className="pcMp-count-num">3</div>
      <Title size={1}>ALL PLAYERS READY</Title>
      <div className="pcMp-row pcMp-count-row">
        {active.map(player => (
          <Player
            key={player.id}
            player={{ ...player, status: "ready" }}
            rep="mascot"
          />
        ))}
      </div>
      <Dim>LAUNCHING {game?.title?.toUpperCase()}…</Dim>
    </div>
  )
}
