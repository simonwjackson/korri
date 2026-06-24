/**
 * Seed-proof — the in-memory seed + the atom initial values that swap the live
 * RPC layers for it. Every screen reads the same seeded catalog atom, so the
 * whole harness is click-through with no API/device.
 */
import { EntrySource } from "@platform/api/rpc/entry-source"
import {
  type CatalogEntry,
  type CatalogSnapshotFacts,
  makeInMemoryCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { makeInMemoryLibrarySourceLayer } from "@platform/library/library-source-layer-memory"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { DEV_GAME_MEDIA } from "@product/surfaces/web/shift/dev-game-media"

const SOURCE = new EntrySource({
  hostId: "local",
  controlUrl: "",
  isLocal: true,
})

const mediaFor = (id: string, gridUrl: string, heroUrl: string) => [
  {
    role: "tile" as const,
    type: "image" as const,
    width: 600,
    height: 900,
    assetId: `${id}-tile`,
    url: gridUrl,
  },
  {
    role: "banner" as const,
    type: "image" as const,
    width: 1920,
    height: 620,
    assetId: `${id}-hero`,
    url: heroUrl,
  },
]

const entries = DEV_GAME_MEDIA.map(
  (m): CatalogEntry => ({
    id: m.id,
    itemId: m.id,
    title: m.title,
    launchable: true,
    releases: [{ id: m.id, system: "steam", launchable: true }],
    system: "steam",
    metadata: { name: m.title },
    media: mediaFor(m.id, m.gridUrl, m.heroUrl),
    source: SOURCE,
  }),
)

const facts: CatalogSnapshotFacts = {
  entries,
  peers: [],
  generation: 1,
  updatedAt: new Date().toISOString(),
  health: {
    coordinatorReachable: true,
    self: "ready",
    loadingPeers: 0,
    readyPeers: 1,
    failedPeers: 0,
    generation: 1,
  },
}

const games = DEV_GAME_MEDIA.map(
  (m): ResolvedGameRecord => ({
    id: m.id,
    system: "steam",
    contentPath: `/library/${m.id}`,
    metadata: { name: m.title, developer: m.developer, genre: [m.genre] },
    media: mediaFor(m.id, m.gridUrl, m.heroUrl),
  }),
)

/** Drop-in for HomeRuntimeLayersRoot's production layer seeding, but in-memory. */
export const seedInitialValues = [
  [catalogFactsSourceLayerAtom, makeInMemoryCatalogFactsSourceLayer(facts)],
  [librarySourceLayerAtom, makeInMemoryLibrarySourceLayer({ games })],
  [
    launcherLayerAtom,
    makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
  ],
] as const
