/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Runtime PICO-8 palette remap. Quantizes an ImageData buffer in place to the
 * nearest of the 16 PICO-8 colors (flat, no dither — the look the pixelart
 * research landed on). Alpha is preserved so transparent logo art stays cut out.
 * This is the in-browser half of the offline `magick -remap` pipeline, so live
 * library art (any same-origin / CORS-enabled URL) can be pixelized on the fly.
 */
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

/** Snap every opaque pixel to the nearest PICO-8 color (squared-RGB distance). */
export function quantizePico8(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 8) continue // keep (near-)transparent pixels
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    let best = P8[0]
    let bestDist = Number.POSITIVE_INFINITY
    for (const c of P8) {
      const dr = r - c[0]
      const dg = g - c[1]
      const db = b - c[2]
      const dist = dr * dr + dg * dg + db * db
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
