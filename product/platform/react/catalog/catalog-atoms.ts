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

export const catalogSnapshotAtom = catalogFactsRuntime
  .atom(
    Effect.gen(function* () {
      const source = yield* CatalogFactsSource
      return yield* source.snapshot("fabric")
    }),
  )
  .pipe(Atom.withRefresh(Duration.seconds(1)))
