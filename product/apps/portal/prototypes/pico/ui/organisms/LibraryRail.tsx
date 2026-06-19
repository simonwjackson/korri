/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The library home coverflow: a row of carts with one focused (scaled up). Note
 * this is the library rail (pcLib-* classes, fav stars shown) — distinct from
 * the Showcase CoverflowRail; generalising the two is a later call.
 */
import type { PicoGame } from "../../fixtures"
import { GameCart } from "../molecules/GameCart"

export function LibraryRail({
  games,
  focusedIndex,
}: {
  readonly games: readonly PicoGame[]
  readonly focusedIndex: number
}) {
  return (
    <div className="pcLib-coverflow">
      {games.map((game, index) => (
        <div
          key={game.id}
          className={`pcLib-cart ${index === focusedIndex ? "focused" : ""}`}
        >
          <GameCart game={game} />
        </div>
      ))}
    </div>
  )
}
