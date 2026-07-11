import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class FreezeSessionPayload extends Schema.Class<FreezeSessionPayload>(
  "FreezeSessionPayload",
)({
  /** Absent means "freeze the active managed launch". */
  launchId: Schema.optional(Schema.String),
}) {}

const Frozen = Schema.Struct({
  _tag: Schema.Literal("Frozen"),
  launchId: Schema.String,
})

const AlreadyFrozen = Schema.Struct({
  _tag: Schema.Literal("AlreadyFrozen"),
  launchId: Schema.String,
})

const NothingActive = Schema.Struct({
  _tag: Schema.Literal("NothingActive"),
})

const Unsupported = Schema.Struct({
  _tag: Schema.Literal("Unsupported"),
  message: Schema.optional(Schema.String),
})

const SessiondNotConfigured = Schema.Struct({
  _tag: Schema.Literal("SessiondNotConfigured"),
})

const HostUnavailable = Schema.Struct({
  _tag: Schema.Literal("HostUnavailable"),
  message: Schema.optional(Schema.String),
})

const FreezeSessionResponse = Schema.Union([
  Frozen,
  AlreadyFrozen,
  NothingActive,
  Unsupported,
  SessiondNotConfigured,
  HostUnavailable,
])

export const FreezeSessionRpc = Rpc.make("app.session.freeze", {
  payload: FreezeSessionPayload,
  success: FreezeSessionResponse,
  error: ApiError,
})
