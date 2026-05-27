import { EntrySource } from "@shared/api/rpc/entry-source"
import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ListSourcePayload extends Schema.Class<ListSourcePayload>(
  "ListSourcePayload",
)({}) {}

/**
 * Catalog entry for `app.source.list`. The structural `source` tag is
 * the same shape as the one on `LibraryEntry` (see
 * `korri/products/app/api/library/list.rpc.ts`) so federation routing
 * works against either RPC.
 */
export class SourceCatalogGame extends Schema.Class<SourceCatalogGame>(
  "SourceCatalogGame",
)({
  id: Schema.String,
  displayName: Schema.String,
  streamable: Schema.Boolean,
  source: EntrySource,
}) {}

export class ListSourceResponse extends Schema.Class<ListSourceResponse>(
  "ListSourceResponse",
)({
  games: Schema.Array(SourceCatalogGame),
}) {}

export const ListSourceRpc = Rpc.make("app.source.list", {
  payload: ListSourcePayload,
  success: ListSourceResponse,
  error: ApiError,
})
