/** PROTOTYPE — pico theme exploration. Throwaway. */

import type { PicoGame } from "./fixtures"
import { renderPicoCart } from "./pico-cart-view"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

export function PicoCart({
  game,
  className,
}: {
  readonly game: PicoGame
  readonly className?: string
}) {
  return renderPicoCart({
    game,
    className,
    favoriteMark: "visible",
    partAttrs: picoDesignPartAttrs(PICO_DESIGN_PARTS.gameCart),
  })
}
