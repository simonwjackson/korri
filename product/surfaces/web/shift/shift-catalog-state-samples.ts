/**
 * One representative catalog snapshot per data state — the single source the
 * gallery reads to show the home in every data state without a backend. Keyed by
 * every `ShiftCatalogState` tag (exhaustive), so a new data state can't be added
 * without a sample, and the gallery picks it up automatically.
 *
 * Each sample is a real `AsyncResult` fed to the real `ShiftCatalogStateRoot`,
 * so the state machine (not a hand-mapped switch) decides which body renders.
 */
import type {
  CatalogEntry,
  CatalogSnapshotFacts,
} from "@platform/catalog/catalog-facts-source"
import { CatalogFactsError } from "@platform/catalog/catalog-facts-source"
import { Cause } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type { ShiftCatalogState } from "./catalog/shift-catalog-state"
import { DEV_GAME_MEDIA } from "./dev-game-media"

export type CatalogResult = AsyncResult.AsyncResult<
  CatalogSnapshotFacts,
  CatalogFactsError
>

const FIXTURE_ENTRIES: readonly CatalogEntry[] = DEV_GAME_MEDIA.slice(0, 6).map(
  media => ({
    id: media.id,
    itemId: media.id,
    title: media.title,
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    metadata: {
      name: media.title,
      genre: [media.genre],
      developer: media.developer,
    },
    media: [
      {
        role: "tile",
        type: "image",
        assetId: `${media.id}-tile`,
        url: media.gridUrl,
        width: 600,
        height: 900,
      },
      {
        role: "banner",
        type: "image",
        assetId: `${media.id}-hero`,
        url: media.heroUrl,
        width: 1920,
        height: 620,
      },
    ],
    source: {
      hostId: "self",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    },
  }),
)

function selfPeer(status: "loading" | "ready" | "failed", error?: string) {
  return {
    hostId: "self",
    displayName: "self",
    controlUrl: "http://127.0.0.1:3001",
    isLocal: true,
    caps: ["source"],
    status,
    entryCount: 0,
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...(error ? { error } : {}),
  }
}

function snapshot(
  entries: readonly CatalogEntry[],
  self: "ready" | "loading" | "failed",
  error?: string,
): CatalogSnapshotFacts {
  return {
    entries,
    peers: [selfPeer(self, error)],
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

export const shiftCatalogStateSamples: {
  readonly [Tag in ShiftCatalogState["_tag"]]: () => CatalogResult
} = {
  Loading: () => AsyncResult.initial(true),
  Ready: () => AsyncResult.success(snapshot(FIXTURE_ENTRIES, "ready")),
  Empty: () => AsyncResult.success(snapshot([], "ready")),
  LoadError: () =>
    AsyncResult.fail(
      new CatalogFactsError({
        reason: "unavailable",
        message: "Local catalog is offline",
      }),
    ),
  Defect: () => AsyncResult.failure(Cause.die("Unexpected catalog defect")),
}
