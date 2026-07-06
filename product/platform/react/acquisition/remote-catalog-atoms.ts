/**
 * Remote catalog atoms — the reactive store-search state.
 *
 * Mirrors `catalog-atoms`: the composition root seeds
 * `remoteCatalogSourceLayerAtom` with a real transport (bridge RPC in the
 * product, in-memory in tests); `storeSearchQueryAtom` holds the current
 * query (the route mirrors its typed URL search into it); and
 * `storeSearchResultsAtom` re-runs the plugin search whenever the query
 * changes. An empty query resolves to no claims WITHOUT touching the source,
 * so opening the store never fans out a blank search to every plugin.
 */
import {
  loadingForeverRemoteCatalogSourceLayer,
  RemoteCatalogSource,
} from "@platform/acquisition/remote-catalog-source"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export const remoteCatalogSourceLayerAtom = Atom.make(
  loadingForeverRemoteCatalogSourceLayer,
)

export const remoteCatalogRuntime = Atom.runtime(get =>
  get(remoteCatalogSourceLayerAtom),
)

export const storeSearchQueryAtom = Atom.make("")

export const storeSearchResultsAtom = remoteCatalogRuntime.atom(get => {
  const query = get(storeSearchQueryAtom).trim()
  if (query === "") return Effect.succeed({ claims: [] as const })
  return Effect.gen(function* () {
    const source = yield* RemoteCatalogSource
    return yield* source.search({ query })
  })
})
