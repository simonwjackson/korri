/**
 * Legacy design-tool seam: preview the home's catalog DATA state without a
 * backend. A tiny cross-root singleton (mirrors pico-settings) so a control in
 * the lab's React root can drive the data state of a Shift surface
 * mounted in a separate root. Inert in production — nothing sets it unless a
 * design tool does, so `useShiftCatalogPreview()` returns null and the real
 * catalog loader wins.
 *
 * The pinned values come from `shiftCatalogStateSamples` (keyed by every
 * `ShiftCatalogState` tag), the same source the gallery reads, so the inspect
 * pin and the live render can never drift from the state machine.
 */
import { useSyncExternalStore } from "react"
import type { CatalogResult } from "./shift-catalog-state-samples"

let preview: CatalogResult | null = null
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

export function setShiftCatalogPreview(next: CatalogResult | null): void {
  preview = next
  emit()
}

/** Non-reactive read of the current data pin (null when live). Used by design
 * tools to capture the current coordinate; product code consults the hook. */
export function getShiftCatalogPreview(): CatalogResult | null {
  return preview
}

export function useShiftCatalogPreview(): CatalogResult | null {
  return useSyncExternalStore(
    subscribe,
    () => preview,
    () => null,
  )
}
