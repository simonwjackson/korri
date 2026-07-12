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

// keepAlive: composition roots seed this layer ONCE via useAtomInitialValues.
// Without keepAlive the registry disposes the unsubscribed node (e.g. while the
// user sits on Home), and the Store route later re-creates it from the
// loading-forever default — search hangs silently and the UI keeps a stale
// empty result. Seeded layer atoms must survive unsubscribed periods.
export const remoteCatalogSourceLayerAtom = Atom.make(
  loadingForeverRemoteCatalogSourceLayer,
).pipe(Atom.keepAlive)

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
