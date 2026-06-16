import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class FulfillPluginResourcePayload extends Schema.Class<FulfillPluginResourcePayload>(
  "FulfillPluginResourcePayload",
)({
  pluginId: Schema.String,
  resourceId: Schema.String,
}) {}

export class FulfillPluginResourceResponse extends Schema.Class<FulfillPluginResourceResponse>(
  "FulfillPluginResourceResponse",
)({
  pluginId: Schema.String,
  resourceId: Schema.String,
  command: Schema.String,
}) {}

export const FulfillPluginResourceRpc = Rpc.make(
  "app.plugins.resource.fulfill",
  {
    payload: FulfillPluginResourcePayload,
    success: FulfillPluginResourceResponse,
    error: ApiError,
  },
)
