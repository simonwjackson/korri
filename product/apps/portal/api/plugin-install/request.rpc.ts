import { ApiError } from "@platform/api/rpc/errors"
import { PluginInstallState } from "@platform/library/install-state"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class RequestPluginInstallPayload extends Schema.Class<RequestPluginInstallPayload>(
  "RequestPluginInstallPayload",
)({
  providerId: Schema.String,
  appId: Schema.String,
  playableId: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.Literals(["install", "update"])),
}) {}

export class RequestPluginInstallResponse extends Schema.Class<RequestPluginInstallResponse>(
  "RequestPluginInstallResponse",
)({
  providerId: Schema.String,
  appId: Schema.String,
  requestId: Schema.String,
  outcome: Schema.Literals([
    "accepted",
    "already-installed",
    "already-in-progress",
    "rejected",
  ]),
  state: PluginInstallState,
  message: Schema.optional(Schema.String),
  observedAt: Schema.optional(Schema.String),
  providerEvidence: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

export const RequestPluginInstallRpc = Rpc.make(
  "app.plugin.install.request",
  {
    payload: RequestPluginInstallPayload,
    success: RequestPluginInstallResponse,
    error: ApiError,
  },
)
