import { EntrySource } from "@platform/api/rpc/entry-source-core"
import { ApiError } from "@platform/api/rpc/errors"
import { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import { LaunchAlternative } from "@platform/library/launch-alternative"
import { LaunchFailureKind } from "@platform/library/launcher"
import { LaunchCompanionDiagnostic } from "@platform/plugin/launch-companion"
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
  releaseId: Schema.optional(Schema.String),
  appId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  profileId: Schema.optional(Schema.String),
  /** @deprecated use profileId. */
  presetId: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
  override: Schema.optional(EphemeralOverride),
  streamBoundaryArgs: Schema.optional(Schema.Array(Schema.String)),
  launchAlternatives: Schema.optional(Schema.Array(LaunchAlternative)),
}) {}

/**
 * Discriminated rejection-source for a failed launch. Surfaced on the wire
 * via the optional `_tag` discriminator on `LaunchLibraryResponse`.
 *
 * - **PreflightRejected**: `ForegroundSessionOwner`'s preflight rejected
 *   the launch before any spawn attempt.
 *   - `reason.source: "owner-local"` — owner's own state machine was non-idle.
 *   - `reason.source: "sessiond"`    — owner consulted sessiond, which reported
 *     a non-idle mode (`reason.externalMode`).
 *
 * - **DaemonRejected**: sessiond accepted the preflight but rejected
 *   later in the spawn pipeline. Two sources:
 *   - `reason.source: "internal-status"` — `session-launcher.spawnViaSessiond`
 *     re-checked sessiond's mode before the POST and saw it had changed.
 *   - `reason.source: "spawn-post"`     — the `POST /managed-launch` itself
 *     was rejected by sessiond.
 *
 * - **HostUnavailable**: sessiond was unreachable or rejected the
 *   request (`reason.kind: "network" | "request-rejected"`).
 *
 * - **LaunchFailed**: the process spawned but failed (exit code, signal,
 *   process-level error). Today's pre-tag failure surface.
 *
 * - **Accepted** (on a launched response): the launch began successfully.
 *
 * Old callers reading `status` / `failureKind` / `exitCode` continue to
 * work — every variant populates those existing fields with the same
 * values they would have had before this discriminator existed. The
 * discriminator is purely additive.
 *
 * See: docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md
 */
const LaunchResponseTag = Schema.Literals([
  "Accepted",
  "PreflightRejected",
  "DaemonRejected",
  "HostUnavailable",
  "LaunchFailed",
])

// `currentState` (owner FSM tag) was previously optional on this struct
// but is no longer placed on the wire — see SEC-001 in task-017. The
// field is intentionally omitted from the schema. If an older server
// still sends `currentState`, the renderer-side decoder silently strips
// it: Effect Schema's default is `onExcessProperty: "ignore"`. No decode
// failures occur during rolling deploys; the field is just dropped.
//
// task-013 AC #2 added the identity-correlation fields below. Each is
// optional and forward-compat under the rule documented in
// `sessiond-managed-launch-protocol.ts` (additive-only). They are
// stable correlators (request id, game id, session id) safe to share
// with operators; process identity stays daemon-private per task-013
// AC #3 (see `foreground-session-lifecycle.ts`'s rejection docstring).
const PreflightRejectionReason = Schema.Struct({
  source: Schema.Literals(["owner-local", "sessiond"]),
  externalMode: Schema.optional(Schema.String),
  currentRequestId: Schema.optional(Schema.String),
  currentGameId: Schema.optional(Schema.String),
  currentSessionId: Schema.optional(Schema.String),
})

const DaemonRejectionReason = Schema.Struct({
  source: Schema.Literals(["internal-status", "spawn-post"]),
})

const HostUnavailableReason = Schema.Struct({
  kind: Schema.Literals(["network", "request-rejected"]),
})

const LaunchedResult = Schema.Struct({
  _tag: Schema.optional(Schema.Literal("Accepted")),
  status: Schema.Literal("launched"),
})

const FailedResult = Schema.Struct({
  _tag: Schema.optional(LaunchResponseTag),
  status: Schema.Literal("failed"),
  exitCode: Schema.Number,
  stderrTail: Schema.optional(Schema.String),
  failureKind: Schema.optional(LaunchFailureKind),
  preflightReason: Schema.optional(PreflightRejectionReason),
  daemonReason: Schema.optional(DaemonRejectionReason),
  hostUnavailableReason: Schema.optional(HostUnavailableReason),
  diagnostics: Schema.optional(Schema.Array(LaunchCompanionDiagnostic)),
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
