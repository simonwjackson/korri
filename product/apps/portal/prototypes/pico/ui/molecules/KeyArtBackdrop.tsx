/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * Full-bleed pixelized key-art backdrop sitting behind a hero. Renders nothing
 * when there's no source. Lifted from the inlined `pcShow-spot-herobg` /
 * `pcLast-bg` markup so every cinematic surface shares one backdrop component.
 */
import { PicoArtImage } from "../../PicoArtImage"

export function KeyArtBackdrop({
  src,
  ratio = 16 / 9,
  scale = 2.6,
  className,
  imageKey,
}: {
  readonly src: string | null | undefined
  readonly ratio?: number
  readonly scale?: number
  readonly className?: string
  /** Forces a remount (e.g. to re-fire a pop-in) when the hero rotates. */
  readonly imageKey?: string
}) {
  if (!src) return null
  return (
    <PicoArtImage
      key={imageKey}
      src={src}
      ratio={ratio}
      scale={scale}
      className={className}
    />
  )
}
