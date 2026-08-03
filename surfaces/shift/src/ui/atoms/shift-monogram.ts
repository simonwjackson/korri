/**
 * Shift monogram — deterministic initials + hue for games without cover art.
 *
 * When a game carries no tile art, surfaces fall back to a monogram: one or two
 * oversized initials on a hue-tinted panel. Both the initials and the hue derive
 * purely from the game's title, so the same game always draws the same glyph and
 * distinct games spread across the colour wheel. Kept pure and side-effect free
 * so the derivation is directly unit-testable.
 */

/** Filler words we drop so "The Legend of Zelda" reads as "LZ", not "TL"/"LO". */
const NOISE_WORDS = new Set(["the", "a", "an", "of", "and", "to", "in"])

export interface ShiftMonogramGlyph {
  /** One or two uppercase characters. Never empty — falls back to "?". */
  readonly initials: string
  /** Hue in degrees (0–359) for the panel tint. */
  readonly hue: number
}

/** Split a title into its significant words, dropping filler words (articles and
 * connectors) unless doing so would leave nothing to draw from. */
function significantWords(title: string): readonly string[] {
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 0)
  const meaningful = words.filter(word => !NOISE_WORDS.has(word.toLowerCase()))
  return meaningful.length > 0 ? meaningful : words
}

/** First character of a word (codepoint-aware), or "" for an empty word. */
function firstChar(word: string): string {
  return [...word][0] ?? ""
}

/** Up to two uppercase initials: first letters of the first two significant
 * words, or the first two characters of a single word. "?" when empty. */
export function shiftMonogramInitials(title: string): string {
  const [first, second] = significantWords(title)
  if (first === undefined) return "?"
  if (second === undefined) {
    return [...first].slice(0, 2).join("").toUpperCase()
  }
  return (firstChar(first) + firstChar(second)).toUpperCase()
}

/** Deterministic FNV-1a hash of the title mapped onto the 0–359 hue wheel. */
export function shiftMonogramHue(title: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < title.length; i++) {
    hash ^= title.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 360
}

export function shiftMonogram(title: string): ShiftMonogramGlyph {
  return {
    initials: shiftMonogramInitials(title),
    hue: shiftMonogramHue(title),
  }
}
