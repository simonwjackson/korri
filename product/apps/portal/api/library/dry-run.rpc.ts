import { EntrySource } from "@platform/api/rpc/entry-source"
import { ApiError } from "@platform/api/rpc/errors"
import { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import { LaunchSpec } from "@platform/library/launcher"
import { SessiondManagedLaunchMode } from "@platform/library/sessiond-managed-launch-protocol"
import { LaunchCompanionDiagnostic } from "@platform/plugin/launch-companion"
import { LaunchPrepareDiagnostic } from "@platform/plugin/launch-prepare"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class DryRunLaunchPayload extends Schema.Class<DryRunLaunchPayload>(
  "DryRunLaunchPayload",
)({
  id: Schema.String,
  source: Schema.optional(EntrySource),
  releaseId: Schema.optional(Schema.String),
  appId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  profileId: Schema.optional(Schema.String),
  override: Schema.optional(EphemeralOverride),
}) {}

const LaunchSelection = Schema.Struct({
  id: Schema.String,
  releaseId: Schema.optional(Schema.String),
  appId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  profileId: Schema.optional(Schema.String),
})

const GameSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
  sourceId: Schema.optional(Schema.String),
})

const SessionReadiness = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("SessionReady"),
    mode: Schema.optional(SessiondManagedLaunchMode),
  }),
  Schema.Struct({
    _tag: Schema.Literal("SessionBusy"),
    mode: SessiondManagedLaunchMode,
  }),
  Schema.Struct({ _tag: Schema.Literal("SessiondNotConfigured") }),
  Schema.Struct({
    _tag: Schema.Literal("HostUnavailable"),
    message: Schema.optional(Schema.String),
  }),
])

export const DryRunLaunchResponse = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("LaunchDryRunOk"),
    selection: LaunchSelection,
    spec: LaunchSpec,
    readiness: SessionReadiness,
    caveats: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal("LaunchConfigFailed"),
    selection: LaunchSelection,
    message: Schema.String,
    diagnostic: Schema.optional(Schema.String),
    diagnostics: Schema.optional(
      Schema.Array(
        Schema.Union([LaunchCompanionDiagnostic, LaunchPrepareDiagnostic]),
      ),
    ),
  }),
  Schema.Struct({
    _tag: Schema.Literal("HostUnavailable"),
    message: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal("GameNotFound"),
    query: Schema.String,
    candidates: Schema.Array(GameSummary),
  }),
])
export type DryRunLaunchResponse = Schema.Schema.Type<
  typeof DryRunLaunchResponse
>

export const DryRunLaunchRpc = Rpc.make("app.library.launch.dry-run", {
  payload: DryRunLaunchPayload,
  success: DryRunLaunchResponse,
  error: ApiError,
})
