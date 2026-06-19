import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class CollectPluginLifecyclePayload extends Schema.Class<CollectPluginLifecyclePayload>(
  "CollectPluginLifecyclePayload",
)({
  providerId: Schema.String,
  appId: Schema.optional(Schema.String),
  launchId: Schema.optional(Schema.String),
  sinceSequence: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number),
}) {}

export class CollectPluginLifecycleResponse extends Schema.Class<CollectPluginLifecycleResponse>(
  "CollectPluginLifecycleResponse",
)({
  providerId: Schema.String,
  lifecycle: Schema.Unknown,
}) {}

export const CollectPluginLifecycleRpc = Rpc.make(
  "app.plugin.lifecycle.collect",
  {
    payload: CollectPluginLifecyclePayload,
    success: CollectPluginLifecycleResponse,
    error: ApiError,
  },
)
