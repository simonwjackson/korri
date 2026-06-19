/**
 * theme-workshop — generic view store.
 *
 * Tracks the workshop's view axis: one screen on the device lab, or a montage of
 * all of them. Tiny shared external store so the gallery toggle and the
 * ThemeWorkshop composer stay in sync. (Theme-specific knobs like a palette or
 * pixel-granularity live in the theme, not here.)
 */
import { useSyncExternalStore } from "react"

/** Workshop view: one screen in the device lab, or a montage of all of them. */
export type ViewMode = "one" | "all"

let viewMode: ViewMode = "one"
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

export function getViewMode(): ViewMode {
  return viewMode
}

export function setViewMode(next: ViewMode): void {
  if (viewMode !== next) {
    viewMode = next
    emit()
  }
}

/** Toggle one ↔ all (used by the gallery control). */
export function toggleViewMode(): ViewMode {
  setViewMode(viewMode === "one" ? "all" : "one")
  return viewMode
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, getViewMode, () => "one")
}
