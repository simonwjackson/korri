import { ApiError } from "@platform/api/rpc/errors"
import { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class PrepareStreamPayload extends Schema.Class<PrepareStreamPayload>(
  "PrepareStreamPayload",
)({
  id: Schema.String,
  releaseId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  profileId: Schema.optional(Schema.String),
  /** @deprecated use profileId. */
  presetId: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
  override: Schema.optional(EphemeralOverride),
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
