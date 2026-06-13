import { Effect } from "effect"
import { CatalogSnapshot } from "./catalog-snapshot"
import {
  type ListLibraryPayload,
  ListLibraryResponse,
} from "./list.rpc"

/**
 * Returns the current unified catalog snapshot in the legacy flat
 * `app.library.list` shape. Remote peers refresh behind
 * `CatalogSnapshot`; a slow or dead peer cannot block self entries from
 * being returned to existing callers.
 */
export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogSnapshot
    const snapshot = yield* catalog.getSnapshot()
    return new ListLibraryResponse({
      games: snapshot.entries,
      complete: snapshot.health.loadingPeers === 0,
      generation: snapshot.generation,
    })
  })
