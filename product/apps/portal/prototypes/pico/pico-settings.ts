/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Live granularity knob for the runtime PICO-8 remap. Lets the gallery cycle the
 * pixel grid (48 / 60 / 72 / 90 px wide) so the chunky..fine tradeoff can be
 * A/B'd in place without rebaking assets. Tiny external store + a hook so every
 * `PicoArtImage` re-renders when the value changes.
 */
import { useSyncExternalStore } from "react"

export const GRANULARITIES = [48, 60, 72, 90] as const

let granularity = 72
const subscribers = new Set<() => void>()

export function getGranularity(): number {
  return granularity
}

/** Step to the next granularity in the ring (used by the gallery control). */
export function cycleGranularity(): number {
  const index = GRANULARITIES.indexOf(granularity as (typeof GRANULARITIES)[number])
  granularity = GRANULARITIES[(index + 1) % GRANULARITIES.length] ?? 72
  for (const notify of subscribers) notify()
  return granularity
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

export function useGranularity(): number {
  return useSyncExternalStore(subscribe, getGranularity, () => 72)
}
