/**
 * Design-tool catalog samples: one representative `CatalogSnapshotFacts`
 * AsyncResult per display state (Loading / Ready / Empty / LoadError / Defect),
 * built from a surface's own fixture entries.
 *
 * Shared so each surface (Shift, Pico) supplies only its entries and messages,
 * not a copy of the snapshot/peer/health scaffolding or the state-tag list.
 * Inert in production — only the preview singletons and dev-lab adapters consume
 * these; the live routes read the real catalog loader.
 */
import { Cause, Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import {
  type CatalogEntry,
  CatalogFactsError,
  CatalogFactsSource,
  type CatalogSnapshotFacts,
  loadingForeverCatalogFactsSourceLayer,
  makeInMemoryCatalogFactsSourceLayer,
} from "./catalog-facts-source"

export type CatalogResult = AsyncResult.AsyncResult<
  CatalogSnapshotFacts,
  CatalogFactsError
>

/** The catalog display states a data-backed home renders, in tree order. The
 * single source both surfaces' state machines and axes derive from. */
export const CATALOG_DISPLAY_TAGS = [
  "Loading",
  "Ready",
  "Empty",
  "LoadError",
  "Defect",
] as const

export type CatalogDisplayTag = (typeof CATALOG_DISPLAY_TAGS)[number]

export interface CatalogSampleOptions {
  readonly offlineMessage?: string
  readonly defectMessage?: string
}

function readySnapshot(entries: readonly CatalogEntry[]): CatalogSnapshotFacts {
  return {
    entries,
    peers: [
      {
        hostId: "self",
        displayName: "self",
        controlUrl: "http://127.0.0.1:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready",
        entryCount: entries.length,
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
    generation: 1,
    updatedAt: "2026-06-13T00:00:00.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready",
      loadingPeers: 0,
      readyPeers: 1,
      failedPeers: 0,
      generation: 1,
    },
  }
}

/** Build the exhaustive per-state sample table for a surface's fixture entries. */
export function makeCatalogStateSamples(
  entries: readonly CatalogEntry[],
  options: CatalogSampleOptions = {},
): { readonly [Tag in CatalogDisplayTag]: () => CatalogResult } {
  const offlineMessage = options.offlineMessage ?? "Local catalog is offline"
  const defectMessage = options.defectMessage ?? "Unexpected catalog defect"
  return {
    Loading: () => AsyncResult.initial(true),
    Ready: () => AsyncResult.success(readySnapshot(entries)),
    Empty: () => AsyncResult.success(readySnapshot([])),
    LoadError: () =>
      AsyncResult.fail(
        new CatalogFactsError({
          reason: "unavailable",
          message: offlineMessage,
        }),
      ),
    Defect: () => AsyncResult.failure(Cause.die(defectMessage)),
  }
}

/**
 * The same exhaustive per-state table, expressed as real `CatalogFactsSource`
 * **layers** — the data swapped at the surface's real edge
 * (`catalogFactsSourceLayerAtom`), not a side channel. Setting one of these on
 * the live source atom drives the real route through that state with the exact
 * production mechanism; the route reads only `catalogSnapshotAtom`. The Loading
 * layer never resolves (the real loading state); LoadError fails the snapshot;
 * Defect dies. Keyed by every display tag so a new state can't be added without
 * a source layer.
 */
export function makeCatalogStateSourceLayers(
  entries: readonly CatalogEntry[],
  options: CatalogSampleOptions = {},
): {
  readonly [Tag in CatalogDisplayTag]: () => Layer.Layer<CatalogFactsSource>
} {
  const offlineMessage = options.offlineMessage ?? "Local catalog is offline"
  const defectMessage = options.defectMessage ?? "Unexpected catalog defect"
  return {
    Loading: () => loadingForeverCatalogFactsSourceLayer,
    Ready: () => makeInMemoryCatalogFactsSourceLayer(readySnapshot(entries)),
    Empty: () => makeInMemoryCatalogFactsSourceLayer(readySnapshot([])),
    LoadError: () =>
      Layer.succeed(CatalogFactsSource)({
        snapshot: () =>
          Effect.fail(
            new CatalogFactsError({
              reason: "unavailable",
              message: offlineMessage,
            }),
          ),
      }),
    Defect: () =>
      Layer.succeed(CatalogFactsSource)({
        snapshot: () => Effect.die(defectMessage),
      }),
  }
}
