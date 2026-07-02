/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * In-session players HUD: per-player lives/score/signal over the game backdrop,
 * with a co-op footer.
 */
import type { PicoGame } from "../../fixtures"
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../atoms/Badge"
import { Dim } from "../atoms/Dim"
import { Icon } from "../atoms/Icon"
import { Stat } from "../atoms/Stat"
import { KeyArtBackdrop } from "../molecules/KeyArtBackdrop"
import { Player } from "../molecules/Player"

export function SessionPlayersHud({
  game,
  players,
}: {
  readonly game: PicoGame | undefined
  readonly players: readonly PicoPlayer[]
}) {
  const active = players.filter(player => player.status !== "open")
  return (
    <div
      className="pcMp-session"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sessionPlayersHud)}
    >
      <KeyArtBackdrop src={game?.heroUrl} className="pcMp-backdrop" />
      <div className="pcMp-session-grid">
        {active.map(player => (
          <div key={player.id} className={`pcMp-hud p${player.seat}`}>
            <Player player={{ ...player, status: "ready" }} rep="tag" />
            <span className="pcMp-hud-lives">♥♥♥</span>
            <Stat label="pts" value={(player.seat * 12480).toLocaleString()} />
            <span className="pcMp-hud-sig">
              <Icon name="wifi" />
            </span>
          </div>
        ))}
      </div>
      <div className="pcMp-session-foot">
        <Badge tone="good">CO-OP · {active.length}P</Badge>
        <Dim>{game?.title}</Dim>
      </div>
    </div>
  )
}
