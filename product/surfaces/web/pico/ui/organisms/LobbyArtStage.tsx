/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Art-forward lobby: big key-art backdrop + logo, players quiet along the
 * bottom. Reuses KeyArtBackdrop + GameLogo.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"
import { GameLogo } from "../molecules/GameLogo"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"
import { Player } from "../molecules/Player"

export function LobbyArtStage({
  game,
  players,
}: {
  readonly game: PicoGame | undefined
  readonly players: readonly PicoPlayer[]
}) {
  const active = players.filter(player => player.status !== "open")
  return (
    <div
      className="pcMp-lobbyA"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.lobbyArtStage)}
    >
      <KeyArtBackdrop src={game?.heroUrl} className="pcMp-backdrop" />
      <div
        className="pcMp-lobbyA-head"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpLobbyAHead)}
      >
        <GameLogo
          logoUrl={game?.logoUrl}
          title={game?.title ?? "LOBBY"}
          scale={2.4}
          logoClassName="pcMp-logo"
          titleSize={2}
        />
        <Dim>WAITING FOR PLAYERS · {active.length}/4</Dim>
      </div>
      <div
        className="pcMp-lobbyA-seats"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpLobbyASeats)}
      >
        {players.map(player => (
          <Player key={player.id} player={player} rep="avatar" />
        ))}
      </div>
    </div>
  )
}
