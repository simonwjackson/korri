/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * Full-bleed pixelized key-art backdrop sitting behind a hero. Renders nothing
 * when there's no source. Lifted from the inlined `pcShow-spot-herobg` /
 * `pcLast-bg` markup so every cinematic surface shares one backdrop component.
 */
import { PicoArtImage } from "../../PicoArtImage"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function KeyArtBackdrop({
  src,
  ratio = 16 / 9,
  scale = 2.6,
  className,
  imageKey,
  partAttrs,
}: {
  readonly src: string | null | undefined
  readonly ratio?: number
  readonly scale?: number
  readonly className?: string
  /** Forces a remount (e.g. to re-fire a pop-in) when the hero rotates. */
  readonly imageKey?: string
  /** Override the backdrop tag so a composing hero claims this root. */
  readonly partAttrs?: Record<string, string>
}) {
  if (!src) return null
  return (
    <PicoArtImage
      key={imageKey}
      src={src}
      ratio={ratio}
      scale={scale}
      className={className}
      partAttrs={
        partAttrs ?? picoDesignPartAttrs(PICO_DESIGN_PARTS.keyArtBackdrop)
      }
    />
  )
}
