/**
 * Transitional design-tool seam: preview the pico home's catalog DATA state
 * without a backend. A cross-root singleton the live pico routes consult
 * (`preview ?? live`), inert in production. Pico is a
 * leaf surface, so it supplies only its own fixture entries; the sample
 * scaffolding and the state-tag list are shared via `catalog-state-samples`.
 */
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import {
  CATALOG_DISPLAY_TAGS,
  makeCatalogStateSamples,
  type CatalogResult as PicoCatalogResult,
} from "@platform/catalog/catalog-state-samples"
import { useSyncExternalStore } from "react"

export type { PicoCatalogResult }

let preview: PicoCatalogResult | null = null
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

export function setPicoDataPreview(next: PicoCatalogResult | null): void {
  preview = next
  emit()
}

export function getPicoDataPreview(): PicoCatalogResult | null {
  return preview
}

export function usePicoDataPreview(): PicoCatalogResult | null {
  return useSyncExternalStore(
    subscribe,
    () => preview,
    () => null,
  )
}

const PICO_ENTRIES: readonly CatalogEntry[] = [
  "celeste",
  "downwell",
  "hades",
].map(id => ({
  id,
  itemId: id,
  title: id.toUpperCase(),
  releases: [{ id: "default", system: "steam", launchable: true }],
  launchable: true,
  source: {
    hostId: "self",
    controlUrl: "http://127.0.0.1:3001",
    isLocal: true,
  },
}))

/** One representative catalog snapshot per pico data state — exhaustive. */
export const picoDataStateSamples = makeCatalogStateSamples(PICO_ENTRIES, {
  offlineMessage: "Library is offline",
  defectMessage: "Unexpected library defect",
})

/** The pico Data axis states — the shared catalog display tags. */
export const PICO_DATA_TAGS = CATALOG_DISPLAY_TAGS
