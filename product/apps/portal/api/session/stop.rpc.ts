import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class StopSessionPayload extends Schema.Class<StopSessionPayload>(
  "StopSessionPayload",
)({
  force: Schema.optional(Schema.Boolean),
  confirmed: Schema.optional(Schema.Boolean),
}) {}

const Stopped = Schema.Struct({
  _tag: Schema.Literal("Stopped"),
  launchId: Schema.String,
  force: Schema.Boolean,
})

const NothingToStop = Schema.Struct({
  _tag: Schema.Literal("NothingToStop"),
})

const SessiondNotConfigured = Schema.Struct({
  _tag: Schema.Literal("SessiondNotConfigured"),
})

const HostUnavailable = Schema.Struct({
  _tag: Schema.Literal("HostUnavailable"),
  message: Schema.optional(Schema.String),
})

const ConfirmationRequired = Schema.Struct({
  _tag: Schema.Literal("ConfirmationRequired"),
  action: Schema.Literals(["stop-session", "force-stop-session"]),
})

const StopSessionResponse = Schema.Union([
  Stopped,
  NothingToStop,
  SessiondNotConfigured,
  HostUnavailable,
  ConfirmationRequired,
])
export const StopSessionRpc = Rpc.make("app.session.stop", {
  payload: StopSessionPayload,
  success: StopSessionResponse,
  error: ApiError,
})
