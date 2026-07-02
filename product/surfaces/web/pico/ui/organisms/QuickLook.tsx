/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Game quick-look drawer: art + title/meta + stats + continue/releases actions.
 * Moved from screens/PanelsScreens.tsx.
 */
import type { PicoGame } from "../../fixtures"
import { PicoArtImage } from "../../PicoArtImage"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../atoms/Btn"
import { Stat } from "../atoms/Stat"

export function QuickLook({ game }: { readonly game: PicoGame }) {
  return (
    <div className="pcQL" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.quickLook)}>
      {game.art ? <PicoArtImage src={game.art} className="pcQL-art" /> : null}
      <div className="pcQL-title">{game.title}</div>
      <div className="pcQL-meta">
        {game.genre.toUpperCase()} · {game.developer.toUpperCase()}
      </div>
      <div className="pcQL-stats">
        <Stat label="played" value={game.playtimeLabel ?? "—"} />
        <Stat label="last" value={game.lastPlayedLabel ?? "new"} />
      </div>
      <Btn kind="primary">
        <PicoIcon name="play" /> CONTINUE
      </Btn>
      <Btn>RELEASES</Btn>
    </div>
  )
}
