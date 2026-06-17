import {
  CatalogFactsSource,
  loadingForeverCatalogFactsSourceLayer,
} from "@platform/catalog/catalog-facts-source"
import { Duration, Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export const catalogFactsSourceLayerAtom = Atom.make(
  loadingForeverCatalogFactsSourceLayer,
)

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
