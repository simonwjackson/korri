import { EntrySource } from "@shared/api/rpc/entry-source"
import { ApiError } from "@shared/api/rpc/errors"
import { EphemeralOverride } from "@shared/library/config/ephemeral-override"
import { LaunchFailureKind } from "@shared/library/launcher"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class LaunchLibraryPayload extends Schema.Class<LaunchLibraryPayload>(
  "LaunchLibraryPayload",
)({
  id: Schema.String,
  /**
   * Federation source tag. Optional in U1 (schema-additive) — U5 makes
   * it required and adds source-aware routing in the handler. Callers
   * with source available SHOULD include it now; missing-source is
   * treated as local for the U1–U4 window.
   */
  source: Schema.optional(EntrySource),
  userId: Schema.optional(Schema.String),
  presetId: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
  override: Schema.optional(EphemeralOverride),
}) {}

const LaunchedResult = Schema.Struct({
  status: Schema.Literal("launched"),
})

const FailedResult = Schema.Struct({
  status: Schema.Literal("failed"),
  exitCode: Schema.Number,
  stderrTail: Schema.optional(Schema.String),
  failureKind: Schema.optional(LaunchFailureKind),
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
