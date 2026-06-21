import type { PicoGame } from "./fixtures"
import { PicoArtImage } from "./PicoArtImage"
import { ditherStyle, picoArt } from "./pico-art"

export type PicoCartFavoriteMark = "visible" | "hidden"

export function renderPicoCart({
  game,
  className,
  favoriteMark,
}: {
  readonly game: PicoGame
  readonly className?: string
  readonly favoriteMark: PicoCartFavoriteMark
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
      {game.art ? (
        <PicoArtImage src={game.art} className="pico-cart-art" />
      ) : null}
      <span className="pico-cart-notch" />
      {favoriteMark === "visible" && game.favorite ? (
        <span className="pico-fav">★</span>
      ) : null}
      {game.art ? null : (
        <span className="pico-cart-initials">{art.initials}</span>
      )}
    </div>
  )
}
