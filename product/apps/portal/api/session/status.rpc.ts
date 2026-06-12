import { ApiError } from "@platform/api/rpc/errors"
import {
  SessiondManagedLaunchMode as SessionLifecycleMode,
  SessiondManagedLaunchPhase as SessionLifecyclePhase,
} from "@platform/library/sessiond-managed-launch-protocol"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class SessionStatusPayload extends Schema.Class<SessionStatusPayload>(
  "SessionStatusPayload",
)({}) {}

const SessionActive = Schema.Struct({
  launchId: Schema.String,
  mode: SessionLifecycleMode,
  phase: Schema.optional(SessionLifecyclePhase),
})

const SessionStatusOk = Schema.Struct({
  _tag: Schema.Literal("SessionStatus"),
  configured: Schema.Literal(true),
  mode: SessionLifecycleMode,
  active: Schema.optional(SessionActive),
  restoreAttempts: Schema.Number,
  failureReason: Schema.optional(Schema.String),
})

const SessiondNotConfigured = Schema.Struct({
  _tag: Schema.Literal("SessiondNotConfigured"),
})

const SessionHostUnavailable = Schema.Struct({
  _tag: Schema.Literal("HostUnavailable"),
  message: Schema.optional(Schema.String),
})

const SessionStatusResponse = Schema.Union([
  SessionStatusOk,
  SessiondNotConfigured,
  SessionHostUnavailable,
])
export const SessionStatusRpc = Rpc.make("app.session.status", {
  payload: SessionStatusPayload,
  success: SessionStatusResponse,
  error: ApiError,
})
