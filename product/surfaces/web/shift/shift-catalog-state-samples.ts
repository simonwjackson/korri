/**
 * One representative catalog snapshot per data state — the source the lab's Data
 * axis reads to show the home in every data state without a backend. Keyed by
 * every `ShiftCatalogState` tag (exhaustive), so a new data state can't be added
 * without a sample.
 *
 * The snapshot/peer/health scaffolding is shared (`makeCatalogStateSamples`);
 * this file supplies only Shift's fixture entries. Each sample is a real
 * `AsyncResult` fed to the real `ShiftCatalogStateRoot`, so the state machine
 * (not a hand-mapped switch) decides which body renders.
 */
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import {
  type CatalogResult,
  makeCatalogStateSamples,
  makeCatalogStateSourceLayers,
} from "@platform/catalog/catalog-state-samples"
import { DEV_GAME_MEDIA } from "./dev-game-media"

export type { CatalogResult }

export const shiftCatalogFixtureEntries: readonly CatalogEntry[] =
  DEV_GAME_MEDIA.slice(0, 6).map((media, index) => ({
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
    // The first four are recently played (newest first) so the home's Recent
    // section is populated; the last two are unplayed, leaving a Random pick.
    ...(index < 4
      ? {
          playStats: {
            lastPlayed: new Date(Date.UTC(2026, 6, 20 - index)),
            playCount: index + 1,
            totalPlaytimeSeconds: (index + 1) * 600,
          },
        }
      : {}),
  }))

export const shiftCatalogStateSamples = makeCatalogStateSamples(
  shiftCatalogFixtureEntries,
)

/**
 * Shift's catalog states as real source layers — the data set on Shift's live
 * edge (`catalogFactsSourceLayerAtom`) to drive the Home route through each
 * state with the production mechanism, no preview side channel. Same fixture
 * entries as `shiftCatalogStateSamples`, so the gallery snapshots and the
 * in-place dial can't drift.
 */
export const shiftCatalogSourceLayers = makeCatalogStateSourceLayers(
  shiftCatalogFixtureEntries,
)
