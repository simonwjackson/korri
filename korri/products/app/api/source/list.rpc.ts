import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ListSourcePayload extends Schema.Class<ListSourcePayload>(
  "ListSourcePayload",
)({}) {}

export class SourceCatalogGame extends Schema.Class<SourceCatalogGame>(
  "SourceCatalogGame",
)({
  id: Schema.String,
  displayName: Schema.String,
  streamable: Schema.Boolean,
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
