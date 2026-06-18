import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class CollectPluginDiagnosticsPayload extends Schema.Class<CollectPluginDiagnosticsPayload>(
  "CollectPluginDiagnosticsPayload",
)({
  providerId: Schema.String,
  input: Schema.optional(Schema.Unknown),
}) {}

export class CollectPluginDiagnosticsResponse extends Schema.Class<CollectPluginDiagnosticsResponse>(
  "CollectPluginDiagnosticsResponse",
)({
  providerId: Schema.String,
  diagnostics: Schema.Unknown,
}) {}

export const CollectPluginDiagnosticsRpc = Rpc.make(
  "app.plugin.diagnostics.collect",
  {
    payload: CollectPluginDiagnosticsPayload,
    success: CollectPluginDiagnosticsResponse,
    error: ApiError,
  },
)
