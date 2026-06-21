/** PROTOTYPE — pico theme exploration. Throwaway. */

import type { PicoGame } from "./fixtures"
import { renderPicoCart } from "./pico-cart-view"

export function PicoCartUnmarked({
  game,
  className,
}: {
  readonly game: PicoGame
  readonly className?: string
}) {
  return renderPicoCart({ game, className, favoriteMark: "hidden" })
}
