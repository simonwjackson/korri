/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Horizontal strip of cartridges with one active item highlighted. Styling is
 * the Showcase rail (`pcShow-rail*`) for now; generalising it across the other
 * Home variants (Library coverflow uses different classes) is a later pass.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function CoverflowRail({
  games,
  activeIndex,
}: {
  readonly games: readonly PicoGame[]
  readonly activeIndex: number
}) {
  return (
    <div
      className="pcShow-rail"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.coverflowRail)}
    >
      {games.map((game, index) => (
        <div
          key={game.id}
          className={`pcShow-rail-cart ${index === activeIndex ? "on" : ""}`}
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowRailCart)}
        >
          <GameCartUnmarked game={game} />
        </div>
      ))}
    </div>
  )
}
