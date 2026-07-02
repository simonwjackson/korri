/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Compares all four player representations (mascot / tag / avatar / pad) row by
 * row across the current players.
 */
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Player, type PlayerRep } from "../molecules/Player"

const ROWS: readonly { readonly label: string; readonly rep: PlayerRep }[] = [
  { label: "PIXL MASCOT", rep: "mascot" },
  { label: "SEAT TAG", rep: "tag" },
  { label: "AVATAR", rep: "avatar" },
  { label: "CONTROLLER", rep: "pad" },
]

export function PlayerStyleMatrix({
  players,
}: {
  readonly players: readonly PicoPlayer[]
}) {
  return (
    <div
      className="pcMp-styles"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.playerStyleMatrix)}
    >
      {ROWS.map(row => (
        <div className="pcMp-styles-row" key={row.rep}>
          <div className="pcMp-styles-label">{row.label}</div>
          <div className="pcMp-row">
            {players.map(player => (
              <Player key={player.id} player={player} rep={row.rep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
