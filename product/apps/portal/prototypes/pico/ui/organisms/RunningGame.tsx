/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Now-playing main stage: full-bleed running-game backdrop + "RUNNING" tag.
 * Moved from screens/PanelsScreens.tsx.
 */
import type { PicoGame } from "../../fixtures"
import { PicoArtImage } from "../../PicoArtImage"

export function RunningGame({ game }: { readonly game: PicoGame }) {
  const backdrop = game.heroUrl ?? game.art
  return (
    <div className="pcNow-stage">
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
