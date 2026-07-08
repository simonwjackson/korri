/**
 * Shift store route — the Browse composition bound to the real remote
 * catalogs.
 *
 * First wired pass, search only: the query is addressable via typed URL search
 * (`/store?q=…`), mirrored into `storeSearchQueryAtom`, and fanned out to every
 * acquisition plugin with a `search` capability through the seeded
 * `RemoteCatalogSource` layer. Returned claims project into the flat store
 * entry shape (`shiftStoreEntryFromClaim`) with a provider-qualified id so
 * releases from different plugins never collide. Source-facet filtering stays
 * client-side over the returned claims. Acquisition itself is not wired yet —
 * tiles are navigation targets whose detail page comes next, so `onOpen` is
 * deliberately absent.
 */
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RemoteCatalogError } from "@platform/acquisition/remote-catalog-source"
import type { SearchResponse } from "@platform/protocol/acquisition/claim"
import {
  storeSearchQueryAtom,
  storeSearchResultsAtom,
} from "@platform/react/acquisition/remote-catalog-atoms"
import { useInputAction } from "@platform/react/input/use-input-action"
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useEffect, useMemo, useState } from "react"
import { ShiftStoreBrowseTile } from "../pages/ShiftStoreBrowseTile"
import { ShiftStoreEmpty } from "../pages/ShiftStoreEmpty"
import { ShiftStoreFinder } from "../pages/ShiftStoreFinder"
import {
  type ShiftStoreEntry,
  shiftStoreEntryFromClaim,
} from "../pages/shift-store-entry"
import {
  applyShiftStoreQuery,
  deriveShiftStoreSources,
  toggleSource,
} from "../pages/shift-store-query"
import { SHIFT_STORE_PATH } from "./paths"

const SEARCH_DEBOUNCE_MS = 250

/** Provider-qualified projection: ids stay unique across plugins. */
export function shiftStoreEntriesFromSearch(
  response: SearchResponse,
): readonly ShiftStoreEntry[] {
  return response.claims.map(claim => ({
    ...shiftStoreEntryFromClaim(claim),
    id: `${claim.providerId}:${claim.id}`,
  }))
}

/**
 * The route's data-state view, seedable by `result` + `query` so tests can
 * drive every state without a router. Idle (no query) prompts for a search;
 * results render the Browse tile grid with client-side source facets.
 */
export function ShiftStoreSearchView({
  query,
  text,
  onText,
  result,
  onRetry,
  onBack,
}: {
  readonly query: string
  readonly text: string
  readonly onText: (value: string) => void
  readonly result: AsyncResult.AsyncResult<SearchResponse, RemoteCatalogError>
  readonly onRetry?: () => void
  readonly onBack?: () => void
}) {
  const [sources, setSources] = useState<readonly string[]>([])

  const entries = useMemo(
    () =>
      AsyncResult.matchWithError(result, {
        onInitial: () => [] as readonly ShiftStoreEntry[],
        onError: () => [] as readonly ShiftStoreEntry[],
        onDefect: () => [] as readonly ShiftStoreEntry[],
        onSuccess: success => shiftStoreEntriesFromSearch(success.value),
      }),
    [result],
  )
  const facets = useMemo(() => deriveShiftStoreSources(entries), [entries])
  const visible = useMemo(
    () =>
      applyShiftStoreQuery(entries, { text: "", sources, sort: "relevance" }),
    [entries, sources],
  )

  useInputAction("back", () => onBack?.())

  const body = AsyncResult.matchWithError(result, {
    onInitial: () =>
      query === "" ? (
        <ShiftStoreEmpty message="Type to search the remote catalogs." />
      ) : (
        <ShiftStoreEmpty message="Searching…" />
      ),
    onError: error => (
      <div className="shift-store-status">
        <ShiftStoreEmpty
          message={error.message ?? "The remote catalogs are unreachable."}
        />
        {onRetry ? (
          <button type="button" className="shift-store-retry" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    ),
    onDefect: () => (
      <ShiftStoreEmpty message="Something went wrong searching." />
    ),
    onSuccess: () => {
      if (query === "")
        return <ShiftStoreEmpty message="Type to search the remote catalogs." />
      if (visible.length === 0) return <ShiftStoreEmpty />
      return (
        <div className="shift-store-tiles">
          {visible.map(entry => (
            <ShiftStoreBrowseTile key={entry.id} entry={entry} />
          ))}
        </div>
      )
    },
  })

  return (
    <div data-shift-store className="shift-store shift-store-browse intrinsic">
      <header className="shift-store-top">
        <h2 className="shift-store-heading">Store</h2>
        <ShiftStoreFinder
          text={text}
          onText={onText}
          facets={facets}
          selected={sources}
          onToggleSource={source =>
            setSources(current => toggleSource(current, source))
          }
        />
      </header>
      {body}
    </div>
  )
}

export function ShiftStoreRoute() {
  const navigate = useNavigate()
  const router = useRouter()
  const search = useSearch({ strict: false }) as { readonly q?: string }
  const routeQuery = search.q ?? ""

  const setQuery = useAtomSet(storeSearchQueryAtom)
  const result = useAtomValue(storeSearchResultsAtom)
  const retry = useAtomRefresh(storeSearchResultsAtom)

  const [text, setText] = useState(routeQuery)
  const [activeQuery, setActiveQuery] = useState(routeQuery)

  // Route search remains deep-linkable, but it is not the only live edge: the
  // kiosk's app-mode Chromium can leave hash-search propagation lagging while
  // the input itself has already changed. Sync URL -> atom for cold loads and
  // back/forward navigation without rolling back newer local typing.
  useEffect(() => {
    setQuery(routeQuery)
    setActiveQuery(current => {
      if (current === routeQuery) return current
      setText(routeQuery)
      return routeQuery
    })
  }, [routeQuery, setQuery])

  // Debounce keystrokes into the remote-search atom first, then mirror them to
  // the URL. Results should not depend on the router finishing a replace before
  // the Store can search.
  useEffect(() => {
    if (text === activeQuery) return undefined
    const timer = setTimeout(() => {
      setActiveQuery(text)
      setQuery(text)
      void navigate({
        to: SHIFT_STORE_PATH,
        search: { q: text },
        replace: true,
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, activeQuery, navigate, setQuery])

  return (
    <ShiftStoreSearchView
      query={activeQuery}
      text={text}
      onText={setText}
      result={result}
      onRetry={retry}
      onBack={() => router.history.back()}
    />
  )
}
