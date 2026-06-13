import { Effect } from "effect"
import { CatalogSnapshot } from "./catalog-snapshot"
import type { CatalogSnapshotPayload } from "./snapshot.rpc"

export const handleCatalogSnapshot = (
  payload: typeof CatalogSnapshotPayload.Type,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogSnapshot
    return yield* catalog.getSnapshot(payload.scope)
  })
