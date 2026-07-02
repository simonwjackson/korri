/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Now-playing main stage: full-bleed running-game backdrop + "RUNNING" tag.
 * Moved from screens/PanelsScreens.tsx.
 */
import type { PicoGame } from "../../fixtures"
import { PicoArtImage } from "../../PicoArtImage"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function RunningGame({ game }: { readonly game: PicoGame }) {
  const backdrop = game.heroUrl ?? game.art
  return (
    <div
      className="pcNow-stage"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.runningGame)}
    >
      {backdrop ? (
        <PicoArtImage
          src={backdrop}
          ratio={16 / 9}
          scale={2.8}
          className="pcNow-bg"
        />
      ) : null}
      <div className="pcNow-tag">
        <span className="pcNow-dot" /> RUNNING · {game.title.toUpperCase()}
      </div>
    </div>
  )
}
