import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class PrepareStreamPayload extends Schema.Class<PrepareStreamPayload>(
  "PrepareStreamPayload",
)({
  id: Schema.String,
}) {}

export class PrepareStreamResponse extends Schema.Class<PrepareStreamResponse>(
  "PrepareStreamResponse",
)({
  status: Schema.Literal("prepared"),
  gameId: Schema.String,
  intentPath: Schema.String,
}) {}

export const PrepareStreamRpc = Rpc.make("app.stream.prepare", {
  payload: PrepareStreamPayload,
  success: PrepareStreamResponse,
  error: ApiError,
})
