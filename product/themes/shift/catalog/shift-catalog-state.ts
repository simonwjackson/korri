import {
  type CatalogEntry,
  CatalogFactsError,
  type CatalogSnapshotFacts,
} from "@platform/catalog/catalog-facts-source"
import { Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

export type ShiftCatalogState =
  | { readonly _tag: "Loading" }
  | {
      readonly _tag: "Ready"
      readonly games: readonly CatalogEntry[]
      readonly peers: CatalogSnapshotFacts["peers"]
      readonly health: CatalogSnapshotFacts["health"]
    }
  | {
      readonly _tag: "Empty"
      readonly peers: CatalogSnapshotFacts["peers"]
      readonly health: CatalogSnapshotFacts["health"]
    }
  | { readonly _tag: "LoadError"; readonly error: CatalogFactsError }
  | { readonly _tag: "Defect"; readonly defect: unknown }

export const ShiftCatalogState = {
  fromResult: (
    result: AsyncResult.AsyncResult<CatalogSnapshotFacts, CatalogFactsError>,
  ): ShiftCatalogState =>
    AsyncResult.matchWithError(result, {
      onInitial: () => ({ _tag: "Loading" }),
      onError: error => ({ _tag: "LoadError", error }),
      onDefect: defect => ({ _tag: "Defect", defect }),
      onSuccess: success => fromSnapshot(success.value),
    }),

  select:
    <Tag extends ShiftCatalogState["_tag"]>(tag: Tag) =>
    (
      state: ShiftCatalogState,
    ): Option.Option<Extract<ShiftCatalogState, { readonly _tag: Tag }>> =>
      state._tag === tag
        ? Option.some(
            state as Extract<ShiftCatalogState, { readonly _tag: Tag }>,
          )
        : Option.none(),
}

function fromSnapshot(snapshot: CatalogSnapshotFacts): ShiftCatalogState {
  const self = snapshot.peers.find(peer => peer.isLocal)
  if (self?.status === "failed") {
    return {
      _tag: "LoadError",
      error: new CatalogFactsError({
        reason: "unavailable",
        message: self.error ?? "Local catalog failed",
      }),
    }
  }
  if (self?.status === "loading") return { _tag: "Loading" }
  if (snapshot.entries.length === 0) {
    return {
      _tag: "Empty",
      peers: snapshot.peers,
      health: snapshot.health,
    }
  }
  return {
    _tag: "Ready",
    games: snapshot.entries,
    peers: snapshot.peers,
    health: snapshot.health,
  }
}
