import { Effect } from "effect"
import { CatalogSnapshot } from "./catalog-snapshot"
import type { LibrarySnapshotPayload } from "./snapshot.rpc"

export const handleLibrarySnapshot = (
  _payload: typeof LibrarySnapshotPayload.Type,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogSnapshot
    return yield* catalog.getSnapshot()
  })
