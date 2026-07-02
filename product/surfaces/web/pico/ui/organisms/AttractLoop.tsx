/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The arcade attract loop: starfield, big logo, a looping cart marquee, and a
 * hi-score / press-start footer.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function AttractLoop({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  const carts = games.slice(0, 6)
  return (
    <div
      className="pcPer-attract"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.attractLoop)}
    >
      <div
        className="pcPer-stars"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerStars)}
      />
      <div
        className="pcPer-attract-mid"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerAttractMid)}
      >
        <div
          className="pcPer-logo"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerLogo)}
        >
          PICO
        </div>
        <div
          className="pcPer-attract-rail"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerAttractRail)}
        >
          {[...carts, ...carts].map((game, index) => (
            <div
              className="pcPer-attract-cart"
              key={`${game.id}-${index}`}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerAttractCart)}
            >
              <GameCartUnmarked game={game} />
            </div>
          ))}
        </div>
      </div>
      <div
        className="pcPer-hiscore"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerHiscore)}
      >
        <span>HI-SCORE 999999</span>
        <span
          className="pcPer-press"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPress)}
        >
          PRESS START
        </span>
      </div>
    </div>
  )
}
