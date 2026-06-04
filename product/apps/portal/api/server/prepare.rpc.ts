import { ApiError } from "@platform/api/rpc/errors"
import { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ServerPrepareStreamPayload extends Schema.Class<ServerPrepareStreamPayload>(
  "ServerPrepareStreamPayload",
)({
  id: Schema.String,
  userId: Schema.optional(Schema.String),
  presetId: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
  override: Schema.optional(EphemeralOverride),
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
