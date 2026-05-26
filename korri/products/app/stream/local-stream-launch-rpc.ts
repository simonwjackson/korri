import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

const maxLength = (max: number) =>
  Schema.makeFilter<string>(value =>
    value.length <= max ? undefined : `must be ${max} characters or fewer`,
  )

const LocalStreamLaunchGameId = Schema.NonEmptyString.check(maxLength(256))

export class LocalStreamLaunchPayload extends Schema.Class<LocalStreamLaunchPayload>(
  "LocalStreamLaunchPayload",
)({
  id: LocalStreamLaunchGameId,
}) {}

const LocalStreamLaunchFailureCategory = Schema.Literals([
  "host-unavailable",
  "host-control-disabled",
  "no-such-game",
  "prepare-failed",
  "input-unavailable",
  "input-ambiguous",
  "session-busy",
])

const LocalStreamLaunchLaunchedResponse = Schema.Struct({
  status: Schema.Literal("launched"),
  gameId: Schema.String,
  sessionId: Schema.optional(Schema.String),
  moonlightCommand: Schema.String,
})

const LocalStreamLaunchPreparedNoMoonlightResponse = Schema.Struct({
  status: Schema.Literal("prepared-no-moonlight"),
  gameId: Schema.String,
  sessionId: Schema.optional(Schema.String),
  message: Schema.String,
})

const LocalStreamLaunchFailedResponse = Schema.Struct({
  status: Schema.Literal("failed"),
  category: LocalStreamLaunchFailureCategory,
  message: Schema.String,
})

export const LocalStreamLaunchResponseSchema = Schema.Union([
  LocalStreamLaunchLaunchedResponse,
  LocalStreamLaunchPreparedNoMoonlightResponse,
  LocalStreamLaunchFailedResponse,
])
export type LocalStreamLaunchResponse = Schema.Schema.Type<
  typeof LocalStreamLaunchResponseSchema
>

const LocalStreamLaunchRpc = Rpc.make("app.desktop.launch", {
  payload: LocalStreamLaunchPayload,
  success: LocalStreamLaunchResponseSchema,
  error: ApiError,
})

export const localStreamLaunchRpcGroup = RpcGroup.make(LocalStreamLaunchRpc)
