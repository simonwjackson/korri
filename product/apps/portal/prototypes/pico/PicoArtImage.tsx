/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Loads an image, fits it (cover-crop to `ratio`, or contain for transparent
 * logos), point-downsamples to the live granularity (× `scale`), and
 * PICO-8-quantizes it on a <canvas> — the runtime version of the offline
 * `magick` bake. The canvas bitmap is tiny; CSS upscales it crisp via
 * `image-rendering: pixelated`. Works on any same-origin / CORS art.
 */
import { useEffect, useRef } from "react"
import { useGranularity, usePaletteMode } from "./pico-settings"
import { type PaletteMode, quantizePico8 } from "./pico8-remap"

export function PicoArtImage({
  src,
  ratio = 3 / 4,
  scale = 1,
  fit = "cover",
  granularity,
  mode,
  className,
}: {
  readonly src: string
  /** width / height of the cover-crop box (3/4 = portrait cart). Cover only. */
  readonly ratio?: number
  /** multiplies the live granularity (heroes/logos want a denser grid). */
  readonly scale?: number
  /** "cover" crops to `ratio`; "contain" fits the whole image (for logos). */
  readonly fit?: "cover" | "contain"
  /** explicit pixel-width override; falls back to the live knob. */
  readonly granularity?: number
  /** palette mode override; falls back to the live knob. */
  readonly mode?: PaletteMode
  readonly className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const liveGranularity = useGranularity()
  const livePalette = usePaletteMode()
  const palette = mode ?? livePalette
  const width = Math.max(8, Math.round((granularity ?? liveGranularity) * scale))

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const image = new Image()
    image.onload = () => {
      ctx.imageSmoothingEnabled = false
      if (fit === "contain") {
        // Whole image, no crop; canvas takes the source's aspect so logos
        // keep their shape (transparent areas survive the quantize).
        const height = Math.max(8, Math.round((width * image.height) / image.width))
        canvas.width = width
        canvas.height = height
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        const buffer = ctx.getImageData(0, 0, width, height)
        quantizePico8(buffer.data, palette)
        ctx.putImageData(buffer, 0, 0)
        return
      }
      const height = Math.max(8, Math.round(width / ratio))
      canvas.width = width
      canvas.height = height
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
      quantizePico8(buffer.data, palette)
      ctx.putImageData(buffer, 0, 0)
    }
    image.src = src
  }, [src, ratio, width, fit, palette])

  return <canvas ref={ref} className={`pcArt ${className ?? ""}`} />
}
