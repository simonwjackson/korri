/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Loads an image, cover-crops it to `ratio`, point-downsamples to the live
 * granularity (× `scale`), and PICO-8-quantizes it on a <canvas> — the runtime
 * version of the offline `magick` bake. The canvas bitmap is tiny; CSS upscales
 * it crisp via `image-rendering: pixelated`. Works on any same-origin / CORS art.
 */
import { useEffect, useRef } from "react"
import { useGranularity } from "./pico-settings"
import { quantizePico8 } from "./pico8-remap"

export function PicoArtImage({
  src,
  ratio = 3 / 4,
  scale = 1,
  granularity,
  className,
}: {
  readonly src: string
  /** width / height of the cover-crop box (3/4 = portrait cart). */
  readonly ratio?: number
  /** multiplies the live granularity (heroes want a denser grid than carts). */
  readonly scale?: number
  /** explicit pixel-width override; falls back to the live knob. */
  readonly granularity?: number
  readonly className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useGranularity()
  const width = Math.max(8, Math.round((granularity ?? live) * scale))
  const height = Math.max(8, Math.round(width / ratio))

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const image = new Image()
    image.onload = () => {
      ctx.imageSmoothingEnabled = false
      // Cover-crop the source to the target ratio (center).
      const sourceRatio = image.width / image.height
      let sw = image.width
      let sh = image.height
      let sx = 0
      let sy = 0
      if (sourceRatio > ratio) {
        sw = sh * ratio
        sx = (image.width - sw) / 2
      } else {
        sh = sw / ratio
        sy = (image.height - sh) / 2
      }
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
      const buffer = ctx.getImageData(0, 0, width, height)
      quantizePico8(buffer.data)
      ctx.putImageData(buffer, 0, 0)
    }
    image.src = src
  }, [src, ratio, width, height])

  return <canvas ref={ref} className={`pcArt ${className ?? ""}`} />
}
