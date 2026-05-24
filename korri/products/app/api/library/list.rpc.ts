import { ApiError } from "@shared/api/rpc/errors"
import { ResolvedGameRecord } from "@shared/fixtures/games/game"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ListLibraryPayload extends Schema.Class<ListLibraryPayload>(
  "ListLibraryPayload",
)({}) {}

export class ListLibraryResponse extends Schema.Class<ListLibraryResponse>(
  "ListLibraryResponse",
)({
  games: Schema.Array(ResolvedGameRecord),
}) {}

export const ListLibraryRpc = Rpc.make("app.library.list", {
  payload: ListLibraryPayload,
  success: ListLibraryResponse,
  error: ApiError,
})
