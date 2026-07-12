import {
  CatalogFactsSource,
  loadingForeverCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import { Duration, Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

// keepAlive: seeded once by the composition root; must survive periods with no
// subscribers or the registry re-creates it from the loading-forever default
// (see remote-catalog-atoms.ts for the incident this guards against).
export const catalogFactsSourceLayerAtom = Atom.make(
  loadingForeverCatalogFactsSourceLayer,
).pipe(Atom.keepAlive)

export const catalogFactsRuntime = Atom.runtime(get =>
  get(catalogFactsSourceLayerAtom),
)

export const CATALOG_SNAPSHOT_REFRESH_INTERVAL = Duration.seconds(60)

export const catalogSnapshotAtom = catalogFactsRuntime
  .atom(
    Effect.gen(function* () {
      const source = yield* CatalogFactsSource
      return yield* source.snapshot("fabric")
    }),
  )
  .pipe(Atom.withRefresh(CATALOG_SNAPSHOT_REFRESH_INTERVAL))
