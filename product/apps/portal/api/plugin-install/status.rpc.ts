import { ApiError } from "@platform/api/rpc/errors"
import {
  PluginInstallNextActionHint,
  PluginInstallState,
} from "@platform/library/install-state"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class PluginInstallStatusPayload extends Schema.Class<PluginInstallStatusPayload>(
  "PluginInstallStatusPayload",
)({
  providerId: Schema.String,
  appId: Schema.String,
  requestId: Schema.optional(Schema.String),
}) {}

export class PluginInstallStatusResponse extends Schema.Class<PluginInstallStatusResponse>(
  "PluginInstallStatusResponse",
)({
  providerId: Schema.String,
  appId: Schema.String,
  requestId: Schema.optional(Schema.String),
  state: PluginInstallState,
  bytesDownloaded: Schema.optional(Schema.Number),
  bytesToDownload: Schema.optional(Schema.Number),
  percent: Schema.optional(Schema.Number),
  providerEvidence: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  lastEvidenceAt: Schema.optional(Schema.String),
  nextActionHint: PluginInstallNextActionHint,
  message: Schema.optional(Schema.String),
}) {}

export const PluginInstallStatusRpc = Rpc.make("app.plugin.install.status", {
  payload: PluginInstallStatusPayload,
  success: PluginInstallStatusResponse,
  error: ApiError,
})
