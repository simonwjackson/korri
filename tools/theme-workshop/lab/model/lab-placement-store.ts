/**
 * Live, persisted Compose-board placement pattern. A tiny cross-component store
 * (useSyncExternalStore) so the Settings panel and the board read/write the same
 * value without prop threading, persisted to localStorage like the other lab
 * presentation choices.
 */
import { useSyncExternalStore } from "react"
import {
  DEFAULT_PLACEMENT_PATTERN,
  isPlacementPattern,
  type LabPlacementPattern,
} from "./lab-canvas-placement"

const STORAGE_KEY = "lab-placement-pattern"

let current: LabPlacementPattern = DEFAULT_PLACEMENT_PATTERN
let hydrated = false
const subscribers = new Set<() => void>()

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return
  hydrated = true
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && isPlacementPattern(stored)) current = stored
}

function emit(): void {
  for (const notify of subscribers) notify()
}

function subscribe(callback: () => void): () => void {
  hydrate()
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

export function getLabPlacementPattern(): LabPlacementPattern {
  hydrate()
  return current
}

export function setLabPlacementPattern(next: LabPlacementPattern): void {
  hydrate()
  if (next === current) return
  current = next
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore storage failures (private mode/quota); the choice just won't persist.
    }
  }
  emit()
}

/** Test-only reset so suites don't leak the singleton between cases. */
export function resetLabPlacementPatternForTest(): void {
  current = DEFAULT_PLACEMENT_PATTERN
  hydrated = false
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore.
    }
  }
}

export function useLabPlacementPattern(): LabPlacementPattern {
  return useSyncExternalStore(
    subscribe,
    getLabPlacementPattern,
    () => DEFAULT_PLACEMENT_PATTERN,
  )
}
