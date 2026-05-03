import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class LaunchLibraryPayload extends Schema.Class<LaunchLibraryPayload>(
  "LaunchLibraryPayload",
)({
  id: Schema.String,
}) {}

const LaunchedResult = Schema.Struct({
  status: Schema.Literal("launched"),
})

const FailedResult = Schema.Struct({
  status: Schema.Literal("failed"),
  exitCode: Schema.Number,
  stderrTail: Schema.optional(Schema.String),
})

export const LaunchLibraryResponse = Schema.Union([
  LaunchedResult,
  FailedResult,
])
export type LaunchLibraryResponse = Schema.Schema.Type<
  typeof LaunchLibraryResponse
>

export const LaunchLibraryRpc = Rpc.make("app.library.launch", {
  payload: LaunchLibraryPayload,
  success: LaunchLibraryResponse,
  error: ApiError,
})
