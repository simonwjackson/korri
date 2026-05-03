import { Rpc } from "effect/unstable/rpc"
import { ApiError } from "@shared/api/rpc/errors"
import { GameRecord } from "@shared/fixtures/games/game"
import { Schema } from "effect"

export class ListLibraryPayload extends Schema.Class<ListLibraryPayload>(
  "ListLibraryPayload",
)({}) {}

export class ListLibraryResponse extends Schema.Class<ListLibraryResponse>(
  "ListLibraryResponse",
)({
  games: Schema.Array(GameRecord),
}) {}

export const ListLibraryRpc = Rpc.make("app.library.list", {
  payload: ListLibraryPayload,
  success: ListLibraryResponse,
  error: ApiError,
})
