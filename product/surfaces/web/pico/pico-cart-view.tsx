import type { PicoGame } from "./fixtures"
import { PicoArtImage } from "./PicoArtImage"
import { ditherStyle, picoArt } from "./pico-art"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

export type PicoCartFavoriteMark = "visible" | "hidden"

export function renderPicoCart({
  game,
  className,
  favoriteMark,
  partAttrs,
}: {
  readonly game: PicoGame
  readonly className?: string
  readonly favoriteMark: PicoCartFavoriteMark
  /** data-korri part attrs from the composing cart molecule. */
  readonly partAttrs?: Record<string, string>
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
      {...partAttrs}
    >
      {game.art ? (
        <PicoArtImage src={game.art} className="pico-cart-art" />
      ) : null}
      <span
        className="pico-cart-notch"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.picoCartNotch)}
      />
      {favoriteMark === "visible" && game.favorite ? (
        <span
          className="pico-fav"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.picoFav)}
        >
          ★
        </span>
      ) : null}
      {game.art ? null : (
        <span
          className="pico-cart-initials"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.picoCartInitials)}
        >
          {art.initials}
        </span>
      )}
    </div>
  )
}
