/**
 * Shift store detail route — focused view for one remote catalog claim.
 *
 * The route carries the current Store query in URL search (`q`) so a detail page
 * opened from results can cold-load by re-running the same remote search and
 * selecting the provider-qualified entry id from those claims.
 */
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  RemoteCatalogAcquireStatus,
  RemoteCatalogError,
} from "@platform/acquisition/remote-catalog-source"
import type { SearchResponse } from "@platform/protocol/acquisition/claim"
import {
  storeAcquireFn,
  storeSearchQueryAtom,
  storeSearchResultsAtom,
} from "@platform/react/acquisition/remote-catalog-atoms"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useEffect, useMemo } from "react"
import { ShiftStoreDetail } from "../pages/ShiftStoreDetail"
import { ShiftStoreEmpty } from "../pages/ShiftStoreEmpty"
import type { ShiftStoreEntry } from "../pages/shift-store-entry"
import { shiftStoreEntryIdFromRouteToken } from "./paths"
import { shiftStoreEntriesFromSearch } from "./ShiftStoreRoute"

export function ShiftStoreDetailRoute() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { readonly entryId?: string }
  const search = useSearch({ strict: false }) as { readonly q?: string }
  const query = search.q ?? ""
  const entryId = params.entryId
    ? shiftStoreEntryIdFromRouteToken(params.entryId)
    : undefined

  const setQuery = useAtomSet(storeSearchQueryAtom)
  const result = useAtomValue(storeSearchResultsAtom)
  const retry = useAtomRefresh(storeSearchResultsAtom)

  useEffect(() => {
    setQuery(query)
  }, [query, setQuery])

  const entry = useMemo(
    () => findStoreDetailEntry(result, entryId),
    [result, entryId],
  )

  const onBack = () =>
    navigate({
      to: "/store",
      search: { q: query },
      replace: false,
    })

  const acquire = useAtomSet(storeAcquireFn)
  const acquireResult = useAtomValue(storeAcquireFn)
  const acquireView = storeAcquireView(acquireResult)

  const onPrimary = () => {
    if (!entry?.providerId || !entry.providerItemId) return
    if (acquireView.state !== "idle" && acquireView.state !== "failed") {
      return
    }
    acquire({
      providerId: entry.providerId,
      id: entry.providerItemId,
      ...(entry.claimUrl ? { url: entry.claimUrl } : {}),
      ...(entry.system ? { system: entry.system } : {}),
    })
  }

  return (
    <ShiftStoreDetailBody
      query={query}
      entry={entry}
      result={result}
      onRetry={retry}
      onBack={onBack}
      onPrimary={onPrimary}
      acquireView={acquireView}
    />
  )
}

export interface StoreAcquireView {
  readonly state: "idle" | "acquiring" | "staged" | "imported" | "failed"
  readonly message?: string
}

/** Projects the acquire mutation's AsyncResult into the detail page verbs. */
export function storeAcquireView(
  result: AsyncResult.AsyncResult<
    RemoteCatalogAcquireStatus,
    RemoteCatalogError
  >,
): StoreAcquireView {
  if (result.waiting) return { state: "acquiring" }
  return AsyncResult.matchWithError(result, {
    onInitial: (): StoreAcquireView => ({ state: "idle" }),
    onError: (error): StoreAcquireView => ({
      state: "failed",
      message: error.message ?? "The download failed.",
    }),
    onDefect: (): StoreAcquireView => ({
      state: "failed",
      message: "Something went wrong downloading.",
    }),
    onSuccess: (success): StoreAcquireView => {
      if (success.value.state === "imported") return { state: "imported" }
      if (success.value.state === "staged") {
        return {
          state: "staged",
          message: success.value.message ?? "Downloaded, but not imported yet.",
        }
      }
      return {
        state: "failed",
        message: success.value.message ?? "The download failed.",
      }
    },
  })
}

export function findStoreDetailEntry(
  result: AsyncResult.AsyncResult<SearchResponse, RemoteCatalogError>,
  entryId: string | undefined,
): ShiftStoreEntry | undefined {
  if (!entryId) return undefined
  return AsyncResult.matchWithError(result, {
    onInitial: () => undefined,
    onError: () => undefined,
    onDefect: () => undefined,
    onSuccess: success =>
      shiftStoreEntriesFromSearch(success.value).find(
        entry => entry.id === entryId,
      ),
  })
}

function ShiftStoreDetailBody({
  query,
  entry,
  result,
  onRetry,
  onBack,
  onPrimary,
  acquireView,
}: {
  readonly query: string
  readonly entry: ShiftStoreEntry | undefined
  readonly result: AsyncResult.AsyncResult<SearchResponse, RemoteCatalogError>
  readonly onRetry: () => void
  readonly onBack: () => void
  readonly onPrimary: () => void
  readonly acquireView: StoreAcquireView
}) {
  return AsyncResult.matchWithError(result, {
    onInitial: () => (
      <StoreDetailStatus
        message={query ? "Loading details…" : "Search again to open this item."}
      />
    ),
    onError: error => (
      <div className="shift-store-status">
        <StoreDetailStatus
          message={error.message ?? "The remote catalogs are unreachable."}
        />
        <button type="button" className="shift-store-retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    ),
    onDefect: () => (
      <StoreDetailStatus message="Something went wrong loading details." />
    ),
    onSuccess: () =>
      entry ? (
        <ShiftStoreDetail
          entry={entry}
          onBack={onBack}
          onPrimary={onPrimary}
          {...storeAcquirePresentation(acquireView)}
        />
      ) : (
        <StoreDetailStatus message="Store item not found." />
      ),
  })
}

function storeAcquirePresentation(view: StoreAcquireView): {
  readonly primaryOverride?: { readonly label: string; readonly hint: string }
  readonly notice?: string
} {
  switch (view.state) {
    case "acquiring":
      return {
        primaryOverride: { label: "Getting…", hint: "Getting…" },
      }
    case "imported":
      return {
        primaryOverride: { label: "In your Library", hint: "In your Library" },
        notice: "Added to your Library.",
      }
    case "staged":
      return {
        primaryOverride: { label: "Downloaded", hint: "Downloaded" },
        notice: view.message ?? "Downloaded to this device.",
      }
    case "failed":
      return {
        notice: view.message ?? "The download failed. Try Get again.",
      }
    default:
      return {}
  }
}

function StoreDetailStatus({ message }: { readonly message: string }) {
  return (
    <div data-shift-detail className="shift-detail-split intrinsic">
      <ShiftStoreEmpty message={message} />
    </div>
  )
}
