import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ServerPrepareStreamPayload extends Schema.Class<ServerPrepareStreamPayload>(
  "ServerPrepareStreamPayload",
)({
  id: Schema.String,
}) {}

export class ServerPrepareStreamResponse extends Schema.Class<ServerPrepareStreamResponse>(
  "ServerPrepareStreamResponse",
)({
  status: Schema.Literal("prepared"),
  gameId: Schema.String,
  sessionId: Schema.String,
}) {}

export const ServerPrepareStreamRpc = Rpc.make("app.server.stream.prepare", {
  payload: ServerPrepareStreamPayload,
  success: ServerPrepareStreamResponse,
  error: ApiError,
})
