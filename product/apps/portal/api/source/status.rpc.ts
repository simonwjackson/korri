import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class SourceStatusPayload extends Schema.Class<SourceStatusPayload>(
  "SourceStatusPayload",
)({}) {}

const SourceRunnerMode = Schema.Literals([
  "idle",
  "starting",
  "running",
  "stopping",
  "exited",
  "failed",
])

export class SourceStatusResponse extends Schema.Class<SourceStatusResponse>(
  "SourceStatusResponse",
)({
  status: Schema.Literals(["available", "stream-unavailable"]),
  streamControl: Schema.Literals(["enabled", "disabled"]),
  catalog: Schema.Literals(["available", "unavailable"]),
  runnerMode: Schema.optional(SourceRunnerMode),
  message: Schema.optional(Schema.String),
}) {}

export const SourceStatusRpc = Rpc.make("app.source.status", {
  payload: SourceStatusPayload,
  success: SourceStatusResponse,
  error: ApiError,
})
