import { ApiError } from "@platform/api/rpc/errors"
import {
  SessiondManagedLaunchMode,
  SessiondManagedLaunchPhase,
} from "@platform/library/sessiond-managed-launch-protocol"
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

const StopPending = Schema.Struct({
  _tag: Schema.Literal("StopPending"),
  launchId: Schema.String,
  force: Schema.Boolean,
  mode: Schema.optional(SessiondManagedLaunchMode),
  phase: Schema.optional(SessiondManagedLaunchPhase),
  message: Schema.optional(Schema.String),
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
  StopPending,
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
