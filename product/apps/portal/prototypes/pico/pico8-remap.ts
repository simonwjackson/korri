/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Runtime PICO-8 palette remap. Quantizes an ImageData buffer in place to the
 * nearest of the 16 PICO-8 colors. Alpha is preserved so transparent logo art
 * stays cut out. Two modes:
 *   - "flat":  plain nearest-RGB match (faithful, but real photos drift muddy).
 *   - "vivid": pre-boost contrast + saturation, then match with a penalty
 *     against the grey/dark palette entries for saturated pixels — so mid-tones
 *     snap to bold colors instead of greys. This is what makes converted art
 *     read like a hand-authored PICO-8 *game* (which uses the darks sparingly)
 *     rather than a desaturated photo.
 */
export type PaletteMode = "flat" | "vivid"

const P8: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [29, 43, 83],
  [126, 37, 83],
  [0, 135, 81],
  [171, 82, 54],
  [95, 87, 79],
  [194, 195, 199],
  [255, 241, 232],
  [255, 0, 77],
  [255, 163, 0],
  [255, 236, 39],
  [0, 228, 54],
  [41, 173, 255],
  [131, 118, 156],
  [255, 119, 168],
  [255, 204, 170],
]

/** Per-palette-entry saturation (0 = grey, 1 = pure) — precomputed for the
 * vivid grey-penalty. */
const P8_SAT: readonly number[] = P8.map(([r, g, b]) => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
})

const SAT_BOOST = 1.55
const CONTRAST = 1.12
const GREY_PENALTY = 26000

const clamp = (x: number): number => (x < 0 ? 0 : x > 255 ? 255 : x)

/** Snap every opaque pixel to the nearest PICO-8 color (in place). */
export function quantizePico8(
  data: Uint8ClampedArray,
  mode: PaletteMode = "flat",
): void {
  const vivid = mode === "vivid"
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 8) continue // keep (near-)transparent pixels

    let r = data[i] ?? 0
    let g = data[i + 1] ?? 0
    let b = data[i + 2] ?? 0

    if (vivid) {
      // Contrast around mid-grey, then saturation boost around luma. Pushes
      // pixels off the muddy middle and toward the palette's vivid members.
      r = clamp((r - 128) * CONTRAST + 128)
      g = clamp((g - 128) * CONTRAST + 128)
      b = clamp((b - 128) * CONTRAST + 128)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      r = clamp(luma + (r - luma) * SAT_BOOST)
      g = clamp(luma + (g - luma) * SAT_BOOST)
      b = clamp(luma + (b - luma) * SAT_BOOST)
    }

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max <= 0 ? 0 : (max - min) / max

    let best = P8[0] ?? [0, 0, 0]
    let bestDist = Number.POSITIVE_INFINITY
    for (let p = 0; p < P8.length; p++) {
      const c = P8[p]
      if (!c) continue
      const dr = r - c[0]
      const dg = g - c[1]
      const db = b - c[2]
      let dist = dr * dr + dg * dg + db * db
      if (vivid) {
        // A saturated source pixel pays to land on a grey/dark palette entry,
        // so it prefers a bold color of roughly the right hue.
        dist += sat * (1 - (P8_SAT[p] ?? 0)) * GREY_PENALTY
      }
      if (dist < bestDist) {
        bestDist = dist
        best = c
      }
    }
    data[i] = best[0]
    data[i + 1] = best[1]
    data[i + 2] = best[2]
  }
}
