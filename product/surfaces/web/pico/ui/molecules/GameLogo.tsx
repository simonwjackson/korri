/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * A game's logo art with a typeset-title fallback when there's no logo. Lifted
 * from the repeated `logoUrl ? <PicoArtImage contain> : <h1>` pattern in the
 * Spotlight / Last-Played heroes so the fallback rule lives in one place.
 */
import { PicoArtImage } from "../../PicoArtImage"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function GameLogo({
  logoUrl,
  title,
  scale = 2.4,
  logoClassName,
  titleClassName,
  titleSize = 2,
}: {
  readonly logoUrl: string | null | undefined
  readonly title: string
  readonly scale?: number
  readonly logoClassName?: string
  readonly titleClassName?: string
  readonly titleSize?: -2 | -1 | 0 | 1 | 2 | 3
}) {
  if (logoUrl) {
    return (
      <PicoArtImage
        src={logoUrl}
        fit="contain"
        scale={scale}
        className={logoClassName}
        partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.gameLogo)}
      />
    )
  }
  return (
    <h1
      className={`pc-title pc-t${titleSize} ${titleClassName ?? ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.gameLogo)}
    >
      {title}
    </h1>
  )
}
