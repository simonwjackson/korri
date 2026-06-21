/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The arcade attract loop: starfield, big logo, a looping cart marquee, and a
 * hi-score / press-start footer.
 */
import type { PicoGame } from "../../fixtures"
import { GameCartUnmarked } from "../molecules/GameCartUnmarked"

export function AttractLoop({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  const carts = games.slice(0, 6)
  return (
    <div className="pcPer-attract">
      <div className="pcPer-stars" />
      <div className="pcPer-attract-mid">
        <div className="pcPer-logo">PICO</div>
        <div className="pcPer-attract-rail">
          {[...carts, ...carts].map((game, index) => (
            <div className="pcPer-attract-cart" key={`${game.id}-${index}`}>
              <GameCartUnmarked game={game} />
            </div>
          ))}
        </div>
      </div>
      <div className="pcPer-hiscore">
        <span>HI-SCORE 999999</span>
        <span className="pcPer-press">PRESS START</span>
      </div>
    </div>
  )
}
