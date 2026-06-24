/**
 * Seed-proof — the in-memory ProseQL seed + the atom initial values that swap
 * the live RPC layers for it. Every screen reads the same seeded catalog atom,
 * so the whole harness is click-through with no API/device.
 */
import { EntrySource } from "@platform/api/rpc/entry-source-core"
import { catalogFactsFromLibrarySourceLayer } from "@platform/catalog/catalog-facts-from-library"
import { makeInMemoryLauncherLayer } from "@platform/library/launcher-layer-memory"
import { LibrarySource } from "@platform/library/library-services"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { DEV_GAME_MEDIA } from "@product/surfaces/web/shift/dev-game-media"
import { Layer } from "effect"
import { makeSeededProseqlLibrarySource } from "./seed-proseql"

export const SEED_ENTRY_SOURCE = new EntrySource({
  hostId: "local",
  controlUrl: "memory://local",
  isLocal: true,
})

/** Drop-in for HomeRuntimeLayersRoot's production layer seeding, but backed by
 * the real in-memory ProseQL engine instead of a hand-built facts object. */
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
  ] as const
}
