/**
 * Design-tool seam: preview the pico home's catalog DATA state without a
 * backend — the pico mirror of shift-catalog-preview. A cross-root singleton the
 * live pico routes consult (`preview ?? live`), inert in production. Pico is a
 * leaf surface, so it carries its own small catalog samples rather than
 * depending on another surface's.
 */
import type {
  CatalogEntry,
  CatalogSnapshotFacts,
} from "@platform/catalog/catalog-facts-source"
import { CatalogFactsError } from "@platform/catalog/catalog-facts-source"
import { Cause } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useSyncExternalStore } from "react"

export type PicoCatalogResult = AsyncResult.AsyncResult<
  CatalogSnapshotFacts,
  CatalogFactsError
>

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

function snapshot(
  entries: readonly CatalogEntry[],
  self: "ready" | "loading" | "failed",
): CatalogSnapshotFacts {
  return {
    entries,
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: self,
        entryCount: entries.length,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self,
      loadingPeers: self === "loading" ? 1 : 0,
      readyPeers: self === "ready" ? 1 : 0,
      failedPeers: self === "failed" ? 1 : 0,
      generation: 1,
    },
  }
}

/** One representative catalog snapshot per pico data state — exhaustive. */
export const picoDataStateSamples = {
  Loading: () => AsyncResult.initial(true),
  Ready: () => AsyncResult.success(snapshot(PICO_ENTRIES, "ready")),
  Empty: () => AsyncResult.success(snapshot([], "ready")),
  LoadError: () =>
    AsyncResult.fail(
      new CatalogFactsError({
        reason: "unavailable",
        message: "Library is offline",
      }),
    ),
  Defect: () => AsyncResult.failure(Cause.die("Unexpected library defect")),
} satisfies Record<string, () => PicoCatalogResult>

export const PICO_DATA_TAGS = [
  "Loading",
  "Ready",
  "Empty",
  "LoadError",
  "Defect",
] as const
