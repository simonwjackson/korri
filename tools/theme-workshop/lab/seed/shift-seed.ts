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
  ] as const
}

export type SeedInitialValues = Awaited<
  ReturnType<typeof makeSeedInitialValues>
>
