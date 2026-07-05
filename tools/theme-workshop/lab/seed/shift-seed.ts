import { EntrySource } from "@platform/api/rpc/entry-source-core"
import { deviceStateFromFacts } from "@platform/device/device-facts"
import { catalogFactsFromLibrarySourceLayer } from "@platform/catalog/catalog-facts-from-library"
import type { CatalogEntry } from "@platform/catalog/catalog-facts-source"
import { makeCatalogStateSourceLayers } from "@platform/catalog/catalog-state-samples"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { LibrarySource } from "@platform/library/library-services"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { SHIFT_LIBRARY_GAMES } from "@product/surfaces/web/shift/config"
import { DEV_GAME_MEDIA } from "@product/surfaces/web/shift/dev-game-media"
import {
  type ShiftLibraryGame,
  shiftLibraryGameFromCatalogEntry,
} from "@product/surfaces/web/shift/pages/shift-library-game"
import {
  shiftCatalogFixtureEntries,
  shiftCatalogSourceLayers,
} from "@product/surfaces/web/shift/shift-catalog-state-samples"
import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockIsoAtom,
} from "@product/surfaces/web/shift/shift-clock-state"
import { shiftForegroundSourceLayers } from "@product/surfaces/web/shift/shift-foreground-preview"
import {
  DEFAULT_SHIFT_NETWORK_READING,
  shiftDeviceNetworkStateForNetworkReading,
  shiftNetworkReadingAtom,
} from "@product/surfaces/web/shift/shift-network-state"
import {
  DEFAULT_SHIFT_POWER_READING,
  shiftDeviceStateForPowerReading,
  shiftPowerReadingAtom,
} from "@product/surfaces/web/shift/shift-power-state"
import { Layer } from "effect"
import type { LabInputValue, LabSourceOption } from "../model/lab-source-state"
import { makeSeededProseqlLibrarySource } from "./shift-proseql-seed"

export const SEED_ENTRY_SOURCE = new EntrySource({
  hostId: "local",
  controlUrl: "memory://local",
  isLocal: true,
})

export async function makeSeedInitialValues() {
  const librarySource = await makeSeededProseqlLibrarySource(DEV_GAME_MEDIA)

  return [
    [
      catalogFactsSourceLayerAtom,
      catalogFactsFromLibrarySourceLayer(librarySource, {
        localSource: SEED_ENTRY_SOURCE,
      }),
    ],
    [librarySourceLayerAtom, Layer.succeed(LibrarySource)(librarySource)],
    [
      launcherLayerAtom,
      makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }),
    ],
    [foregroundSessionStatusLayerAtom, shiftForegroundSourceLayers.Ready()],
    [shiftPowerReadingAtom, DEFAULT_SHIFT_POWER_READING],
    [deviceStateAtom, SHIFT_SEED_DEVICE_STATE],
    [shiftClockIsoAtom, DEFAULT_SHIFT_CLOCK_ISO],
    [shiftNetworkReadingAtom, DEFAULT_SHIFT_NETWORK_READING],
  ] as const
}

/** Resting battery device-fact the lab seeds so live Home shows a battery before
 * any battery event is fired (production seeds this from the device-state
 * stream's current-state-first delivery). */
const SHIFT_SEED_OBSERVED_AT = "2026-07-01T00:00:00.000Z"

const SHIFT_SEED_POWER_STATE = shiftDeviceStateForPowerReading(
  DEFAULT_SHIFT_POWER_READING,
  SHIFT_SEED_OBSERVED_AT,
)

const SHIFT_SEED_DEVICE_STATE = deviceStateFromFacts({
  battery: SHIFT_SEED_POWER_STATE.battery,
  network: shiftDeviceNetworkStateForNetworkReading(
    DEFAULT_SHIFT_NETWORK_READING,
    SHIFT_SEED_OBSERVED_AT,
  ),
  observedAt: SHIFT_SEED_OBSERVED_AT,
})

export type SeedInitialValues = Awaited<
  ReturnType<typeof makeSeedInitialValues>
>

// Alternate fixture libraries the lab can swap in at the real catalog edge.
// Each is just data: the same `ShiftHomeRoute` renders whichever set is bound.
function labFixtureGame(
  id: string,
  title: string,
  genre: string,
  developer: string,
): CatalogEntry {
  return {
    id,
    itemId: id,
    title,
    releases: [{ id: "default", system: "steam", launchable: true }],
    launchable: true,
    metadata: { name: title, genre: [genre], developer },
    media: [
      {
        role: "tile",
        type: "image",
        assetId: `${id}-tile`,
        url: `https://example.test/${id}-tile.png`,
        width: 600,
        height: 900,
      },
      {
        role: "banner",
        type: "image",
        assetId: `${id}-hero`,
        url: `https://example.test/${id}-hero.png`,
        width: 1920,
        height: 620,
      },
    ],
    source: { hostId: "self", controlUrl: "memory://local", isLocal: true },
  }
}

const COZY_LIBRARY: readonly CatalogEntry[] = [
  labFixtureGame("aurora-drift", "Aurora Drift", "Adventure", "Lab Fixtures"),
  labFixtureGame("neon-harbor", "Neon Harbor", "Racing", "Lab Fixtures"),
  labFixtureGame("willow-vale", "Willow Vale", "Cozy", "Lab Fixtures"),
]

const RETRO_LIBRARY: readonly CatalogEntry[] = [
  labFixtureGame("pixel-quest", "Pixel Quest", "RPG", "Retro Lab"),
  labFixtureGame("blip-blaster", "Blip Blaster", "Shmup", "Retro Lab"),
]

const SHIFT_FIXTURE_SETS: Record<string, readonly CatalogEntry[] | undefined> =
  {
    dev: shiftCatalogFixtureEntries,
    cozy: COZY_LIBRARY,
    retro: RETRO_LIBRARY,
  }

/** The fixture libraries the lab's Sources panel offers for Shift. */
export const shiftLabSources: readonly LabSourceOption[] = [
  {
    id: "dev",
    label: "Dev library",
    description: "The built-in development games.",
  },
  {
    id: "cozy",
    label: "Cozy picks",
    description: "A small hand-made fixture set.",
  },
  {
    id: "retro",
    label: "Retro shelf",
    description: "Another fixture set, swapped in at the edge.",
  },
]

/**
 * Seed for a chosen fixture source: start from the full dev seed, then — for an
 * alternate library — swap only the catalog source atom (the real edge) to a
 * Ready layer over that library. Same mechanism production injects the live
 * loader through; only the data changes.
 */
export async function makeSeedInitialValuesForBinding(binding: {
  readonly sourceId: string
  readonly stateId: LabInputValue
}): Promise<SeedInitialValues> {
  const base = await makeSeedInitialValues()
  const entries = SHIFT_FIXTURE_SETS[binding.sourceId]
  if (!entries || binding.sourceId === "dev") return base
  const layer = makeCatalogStateSourceLayers(entries).Ready()
  return base.map(pair =>
    pair[0] === catalogFactsSourceLayerAtom
      ? ([pair[0], layer] as const)
      : pair,
  ) as unknown as SeedInitialValues
}

/**
 * Sync resolver for an isolated preview (the Workshop board): the catalog source
 * layer for a chosen fixture library + data state. Dev uses the built-in fixture
 * layers; an alternate library is built on the fly. Unknown state falls back to
 * Ready. Same real edge as production, just no async library wiring.
 */
export function shiftCatalogLayerForBinding(sourceId: string, stateId: string) {
  const entries = SHIFT_FIXTURE_SETS[sourceId]
  const layers =
    entries && sourceId !== "dev"
      ? makeCatalogStateSourceLayers(entries)
      : shiftCatalogSourceLayers
  const tag = (stateId in layers ? stateId : "Ready") as keyof typeof layers
  return layers[tag]()
}

export function shiftEntriesForBinding(
  sourceId: string,
): readonly CatalogEntry[] {
  return SHIFT_FIXTURE_SETS[sourceId] ?? shiftCatalogFixtureEntries
}

/**
 * The chosen fixture library projected into the flat library-tile shape via
 * the real composition-root mapping. Dev keeps the full projection with
 * synthesised user data (favourites, played times); alternate libraries map
 * their catalog entries through `shiftLibraryGameFromCatalogEntry`.
 */
export function shiftLibraryGamesForBinding(
  sourceId: string,
): readonly ShiftLibraryGame[] {
  const entries = SHIFT_FIXTURE_SETS[sourceId]
  if (!entries || sourceId === "dev") return SHIFT_LIBRARY_GAMES
  return entries.map(shiftLibraryGameFromCatalogEntry)
}
