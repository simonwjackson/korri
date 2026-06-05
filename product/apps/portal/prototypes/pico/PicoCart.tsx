/** PROTOTYPE — pico theme exploration. Throwaway. */
import { ditherStyle, picoArt } from "./pico-art"
import type { PicoGame } from "./fixtures"

export function PicoCart({
  game,
  className,
  showFav = true,
}: {
  readonly game: PicoGame
  readonly className?: string
  readonly showFav?: boolean
}) {
  const art = picoArt(game.id, game.title)
  return (
    <div
      className={`pico-cart ${className ?? ""}`}
      style={{
        background: art.fill,
        color: art.ink,
        backgroundImage: ditherStyle(art.seed, art.fill, art.accent),
      }}
    >
      <span className="pico-cart-notch" />
      {showFav && game.favorite ? <span className="pico-fav">★</span> : null}
      <span className="pico-cart-initials">{art.initials}</span>
    </div>
  )
}
