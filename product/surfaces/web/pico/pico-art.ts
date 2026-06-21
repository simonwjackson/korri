/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The fixtures ship no box art, which is on-brand for 8-bit: derive a
 * deterministic "cartridge label" (palette + initials + dither seed)
 * from the game id so every game gets a stable, distinct pixel motif.
 */

// PICO-8 palette — fitting for a theme named "pico".
export const PICO8 = [
  "#000000",
  "#1d2b53",
  "#7e2553",
  "#008751",
  "#ab5236",
  "#5f574f",
  "#c2c3c7",
  "#fff1e8",
  "#ff004d",
  "#ffa300",
  "#ffec27",
  "#00e436",
  "#29adff",
  "#83769c",
  "#ff77a8",
  "#ffccaa",
] as const

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Bright label colours only (skip the near-blacks at 0/1 for the fill).
const LABEL_INDICES = [2, 3, 4, 8, 9, 10, 11, 12, 13, 14]

export interface PicoArt {
  readonly fill: string
  readonly accent: string
  readonly ink: string
  readonly initials: string
  readonly seed: number
}

export function picoArt(id: string, title: string): PicoArt {
  const h = hash(id)
  const fillIndex = LABEL_INDICES[h % LABEL_INDICES.length] ?? 8
  const accentIndex = LABEL_INDICES[(h >> 8) % LABEL_INDICES.length] ?? 10
  const fill = PICO8[fillIndex] ?? "#ff004d"
  const accent =
    accentIndex === fillIndex
      ? (PICO8[(accentIndex + 3) % 16] ?? "#ffec27")
      : (PICO8[accentIndex] ?? "#ffec27")
  // Dark fills get light ink, light fills get dark ink.
  const ink = [3, 4, 13].includes(fillIndex) ? "#fff1e8" : "#000000"
  const initials = title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? "")
    .join("")
  return { fill, accent, ink, initials: initials || "??", seed: h }
}

/** A small dithered checker background derived from the seed. */
export function ditherStyle(seed: number, a: string, b: string): string {
  const size = 4 + (seed % 3) * 2
  return `repeating-conic-gradient(${a} 0% 25%, ${b} 0% 50%) 0 0 / ${size}px ${size}px`
}
