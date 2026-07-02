/** pico surface. */

import type { PicoGame } from "./fixtures"
import { renderPicoCart } from "./pico-cart-view"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

export function PicoCartUnmarked({
  game,
  className,
}: {
  readonly game: PicoGame
  readonly className?: string
}) {
  return renderPicoCart({
    game,
    className,
    favoriteMark: "hidden",
    partAttrs: picoDesignPartAttrs(PICO_DESIGN_PARTS.gameCartUnmarked),
  })
}
