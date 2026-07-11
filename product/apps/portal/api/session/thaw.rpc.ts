import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ThawSessionPayload extends Schema.Class<ThawSessionPayload>(
  "ThawSessionPayload",
)({
  /** Absent means "thaw the active managed launch". */
  launchId: Schema.optional(Schema.String),
}) {}

const Thawed = Schema.Struct({
  _tag: Schema.Literal("Thawed"),
  launchId: Schema.String,
})

const AlreadyThawed = Schema.Struct({
  _tag: Schema.Literal("AlreadyThawed"),
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

const ThawSessionResponse = Schema.Union([
  Thawed,
  AlreadyThawed,
  NothingActive,
  Unsupported,
  SessiondNotConfigured,
  HostUnavailable,
])

export const ThawSessionRpc = Rpc.make("app.session.thaw", {
  payload: ThawSessionPayload,
  success: ThawSessionResponse,
  error: ApiError,
})
