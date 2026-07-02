/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Squeezed-home content: a wrap of carts authored in cqh so it reflows to the
 * narrower main pane when a drawer is open. Moved from screens/PanelsScreens.tsx.
 */
import type { PicoGame } from "../../fixtures"
import { PicoCartUnmarked } from "../../PicoCartUnmarked"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function MiniHome({
  games,
  focusIndex,
}: {
  readonly games: readonly PicoGame[]
  readonly focusIndex?: number
}) {
  return (
    <div
      className="pcHome"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.miniHome)}
    >
      <div className="pcHome-title">CONTINUE</div>
      <div className="pcHome-grid">
        {games.slice(0, 10).map((game, index) => (
          <div
            key={game.id}
            className={`pcHome-cart ${index === focusIndex ? "on" : ""}`}
          >
            <PicoCartUnmarked game={game} />
          </div>
        ))}
      </div>
    </div>
  )
}
