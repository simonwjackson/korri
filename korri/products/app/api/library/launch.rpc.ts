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
 *   capability token (`reason.kind: "network" | "token-rejected"`).
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

const PreflightRejectionReason = Schema.Struct({
  source: Schema.Literals(["owner-local", "sessiond"]),
  externalMode: Schema.optional(Schema.String),
  currentState: Schema.optional(Schema.String),
})

const DaemonRejectionReason = Schema.Struct({
  source: Schema.Literals(["internal-status", "spawn-post"]),
})

const HostUnavailableReason = Schema.Struct({
  kind: Schema.Literals(["network", "token-rejected"]),
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
