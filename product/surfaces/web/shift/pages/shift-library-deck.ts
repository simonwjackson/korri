/**
 * Shift library — Deck navigation (pure).
 *
 * The Deck shows one game full-screen and you riffle through the stack. The
 * index math (wrap-around advance) and the flick→intent mapping live here so the
 * page only animates; directional flicks and on-screen buttons both route
 * through these, keeping the surface device-agnostic and the logic testable.
 */
import type { Direction } from "@platform/input/types"

export type DeckFlick = "play" | "favorite" | "next" | "prev"

export function deckFlickFromDirection(direction: Direction): DeckFlick {
  switch (direction) {
    case "up":
      return "play"
    case "down":
      return "favorite"
    case "left":
      return "prev"
    case "right":
      return "next"
  }
}

export function advanceDeck(
  index: number,
  length: number,
  step: "next" | "prev",
): number {
  if (length <= 0) return 0
  const delta = step === "next" ? 1 : -1
  return (index + delta + length) % length
}
