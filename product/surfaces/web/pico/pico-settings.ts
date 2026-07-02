/**
 * pico surface.
 *
 * Live knobs for the runtime PICO-8 remap, so directions can be A/B'd in place
 * without rebaking assets:
 *   - granularity: the pixel grid (48 / 60 / 72 / 90 px wide) — chunky..fine.
 *   - palette mode: "flat" (faithful nearest-RGB) vs "vivid" (boosted, reads
 *     like a hand-authored PICO-8 game).
 * Tiny shared external store + hooks so every `PicoArtImage` re-renders on change.
 */
import { useSyncExternalStore } from "react"
import type { PaletteMode } from "./pico8-remap"

export const GRANULARITIES = [48, 60, 72, 90] as const
export const PALETTE_MODES = ["vivid", "flat"] as const

let granularity = 72
let paletteMode: PaletteMode = "vivid"
const subscribers = new Set<() => void>()

function emit(): void {
  for (const notify of subscribers) notify()
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

export function getGranularity(): number {
  return granularity
}

/** Step to the next granularity in the ring (used by the gallery control). */
export function cycleGranularity(): number {
  const index = GRANULARITIES.indexOf(
    granularity as (typeof GRANULARITIES)[number],
  )
  granularity = GRANULARITIES[(index + 1) % GRANULARITIES.length] ?? 72
  emit()
  return granularity
}

export function useGranularity(): number {
  return useSyncExternalStore(subscribe, getGranularity, () => 72)
}

export function getPaletteMode(): PaletteMode {
  return paletteMode
}

/** Toggle flat ↔ vivid (used by the gallery control). */
export function cyclePaletteMode(): PaletteMode {
  paletteMode = paletteMode === "vivid" ? "flat" : "vivid"
  emit()
  return paletteMode
}

export function usePaletteMode(): PaletteMode {
  return useSyncExternalStore(subscribe, getPaletteMode, () => "vivid")
}
