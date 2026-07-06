import { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import { Schema } from "effect"
import { LaunchFailureKind, LaunchSpec } from "./launcher"

/**
 * # Sessiond managed-launch protocol evolution rule (task-013 AC #5)
 *
 * These schemas describe the HTTP/SSE wire contract between Korri
 * clients (à la `session-launcher.ts`, `status.rpc-handler.ts`,
 * `foreground-session-status-layer-live.ts`) and sessiond's
 * managed-launch endpoints (`product/services/device/sessiond.ts`). All decoders
 * on the consumer side run under `STRICT_DECODE`
 * (`onExcessProperty: "error"`), which catches typos and version skew
 * during development. The strict default has a consequence: the
 * daemon CANNOT emit a brand-new field before the client schema is
 * updated to recognise it, or the client fails closed.
 *
 * The rule for evolving this protocol:
 *
 * 1. **Schemas update before the daemon emits.** Add the optional
 *    field to the client schema first, ship it as a no-op decoder
 *    branch, then deploy the daemon that emits the value. Older
 *    clients with the new schema accept missing values cleanly.
 *
 * 2. **Additive only.** Required fields are forever — do not remove
 *    or rename a field once it's in the schema. Mark deprecated
 *    fields `Schema.optional` and keep them in the union; let the
 *    consumer ignore them.
 *
 * 3. **Optional by default for new fields.** Every new field added
 *    after the protocol's initial shape should be `Schema.optional`
 *    even when the daemon always emits it. This preserves the
 *    invariant that an older client (decoding against the older
 *    schema) does not fail when it encounters a new daemon. (The
 *    daemon's lack of a never-emitted optional is harmless; the
 *    client's missing-field branch is what matters.)
 *
 * 4. **Mixed-version deployments are not promised but supported.**
 *    Production deploys Korri's client and sessiond together via Nix,
 *    so strict mismatches are caught at build time. But operators do
 *    run mismatched versions during incident response or rollback;
 *    the rules above keep those windows survivable.
 *
 * 5. **Capability flags over schema versioning.** When a daemon-side
 *    change is large enough to warrant gating (e.g. session-lifecycle
 *    spawn in Phase 4D), encode the daemon's support as a capability
 *    flag on `SessiondManagedLaunchCapabilities` (e.g.
 *    `sessionLifecycle`). The capability is the contract; the schema
 *    only describes the wire shape. Clients that don't observe the
 *    capability must NOT send the capability-gated payload, even if
 *    the schema would accept it.
 *
 * If a future change needs to relax the strict-decode posture for
 * forward-compat, prefer adding a lenient parallel decoder for the
 * specific call site (the live polling path can tolerate extra
 * fields) over flipping the global STRICT_DECODE constant. The
 * strictness is the early-warning system; do not give it up wholesale.
 */

const isoDateTime = Schema.makeFilter<string>(value => {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return "must be an ISO timestamp"
  return new Date(time).toISOString() === value
    ? undefined
    : "must be an ISO timestamp"
})

export const SessiondManagedLaunchMode = Schema.Literals([
  "stopped",
  "starting",
  "home",
  "idle",
  "launching",
  "game",
  "restoring",
  "recovering",
])
export type SessiondManagedLaunchMode = Schema.Schema.Type<
  typeof SessiondManagedLaunchMode
>

export const SessiondManagedLaunchLifecycle = Schema.Literals([
  "foreground",
  "session",
])
export type SessiondManagedLaunchLifecycle = Schema.Schema.Type<
  typeof SessiondManagedLaunchLifecycle
>

export const SessiondManagedLaunchCapabilities = Schema.Struct({
  managedLaunch: Schema.Boolean,
  lifecycleEvents: Schema.Boolean,
  perLaunchTermination: Schema.Boolean,
  /**
   * Phase 4D / Track A. When `true`, the daemon accepts
   * `lifecycle: "session"` start requests with an optional `wait` spec
   * and emits the session-lifecycle event peers
   * (`launcher-exited`, `wait-monitor-running`,
   * `wait-monitor-exited`, `session-anchored`). Older Phase 4B
   * daemons omit this field; clients must treat its absence as
   * `false` and fall back to `lifecycle: "foreground"` rather than
   * sending a session-lifecycle launch the daemon cannot supervise.
   */
  sessionLifecycle: Schema.optional(Schema.Boolean),
  /**
   * When true, the daemon accepts Home lane-toggle requests and owns
   * the hub/game decision. Clients without this capability must keep
   * using their legacy Home fallback.
   */
  laneToggle: Schema.optional(Schema.Boolean),
  /**
   * When true, the daemon exposes launch-scoped input-seat status/events
   * and accepts capability-gated leave/release requests. Older daemons omit
   * this field; clients must treat absence as false.
   */
  inputSeats: Schema.optional(Schema.Boolean),
})
export type SessiondManagedLaunchCapabilities = Schema.Schema.Type<
  typeof SessiondManagedLaunchCapabilities
>

/**
 * Phase 4D / Track A finishing follow-up. Operator-facing sub-phase
 * for the currently active launch. Distinguishes `launching` (start
 * accepted, child not yet running), `running` (primary child active),
 * `wait-monitor` (launcher exited cleanly, wait monitor is the
 * active child), `anchored` (launcher exited cleanly, no wait, no
 * live child but sessiond is holding role-foreground state), and
 * `restoring` (post-launch teardown). Coarse `mode` stays the same
 * across the running / wait-monitor / anchored sub-phases (all
 * `mode: "game"`) so Phase 4B clients see no mode-literal change.
 * Older daemons omit this field; clients must treat its absence as
 * "unknown" rather than inferring a default.
 */
export const SessiondManagedLaunchPhase = Schema.Literals([
  "launching",
  "running",
  "wait-monitor",
  "anchored",
  "restoring",
])
export type SessiondManagedLaunchPhase = Schema.Schema.Type<
  typeof SessiondManagedLaunchPhase
>

const LaunchMetadataProviderId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^@[^:]+:.+$/)),
)

const SessiondLaunchMetadata = Schema.Struct({
  appProviderId: Schema.optional(LaunchMetadataProviderId),
  annotations: Schema.optional(
    Schema.Record(LaunchMetadataProviderId, Schema.Unknown),
  ),
})

export const SessiondManagedLaunchInputSeatState = Schema.Literals([
  "available",
  "occupied-connected",
  "occupied-disconnected-reserved",
  "released",
])
export type SessiondManagedLaunchInputSeatState = Schema.Schema.Type<
  typeof SessiondManagedLaunchInputSeatState
>

export const SessiondManagedLaunchInputSeat = Schema.Struct({
  slot: Schema.Number,
  playerIndex: Schema.Number,
  name: Schema.String,
  state: SessiondManagedLaunchInputSeatState,
  /**
   * Redacted, non-authoritative correlation key. Must not contain raw remote
   * source identity, device paths, permission details, or other host-local
   * diagnostics.
   */
  sourceKey: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
})
export type SessiondManagedLaunchInputSeat = Schema.Schema.Type<
  typeof SessiondManagedLaunchInputSeat
>

export const SessiondManagedLaunchInputSeatSummary = Schema.Struct({
  seats: Schema.Array(SessiondManagedLaunchInputSeat),
})
export type SessiondManagedLaunchInputSeatSummary = Schema.Schema.Type<
  typeof SessiondManagedLaunchInputSeatSummary
>

export const SessiondManagedLaunchActive = Schema.Struct({
  launchId: Schema.String,
  mode: SessiondManagedLaunchMode,
  phase: Schema.optional(SessiondManagedLaunchPhase),
  /**
   * Optional, sanitized metadata for clients that need launch ownership facts
   * without exposing raw LaunchSpec internals. Remote Moonlight sessions use
   * this to carry the source host/controlUrl so inputd can stop the host game.
   */
  launchMetadata: Schema.optional(SessiondLaunchMetadata),
  inputSeats: Schema.optional(SessiondManagedLaunchInputSeatSummary),
})
export type SessiondManagedLaunchActive = Schema.Schema.Type<
  typeof SessiondManagedLaunchActive
>

export const SessiondManagedLaunchStatus = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  mode: SessiondManagedLaunchMode,
  capabilities: SessiondManagedLaunchCapabilities,
  active: Schema.optional(SessiondManagedLaunchActive),
  failureReason: Schema.optional(Schema.String),
  restoreAttempts: Schema.Number,
})
export type SessiondManagedLaunchStatus = Schema.Schema.Type<
  typeof SessiondManagedLaunchStatus
>

export const SessiondManagedLaunchStartRequest = Schema.Struct({
  launchId: Schema.optional(Schema.String),
  spec: LaunchSpec,
  launchMetadata: Schema.optional(SessiondLaunchMetadata),
  launchCompanions: Schema.optional(LaunchCompanionMap),
  /**
   * Phase 4D / Track A. Defaults to `"foreground"` when omitted; the
   * daemon treats absence as foreground for Phase 4B back-compat.
   * `"session"` enables launcher-anchor supervision (launcher exits
   * cleanly, optional wait-monitor or anchor-until-terminate).
   */
  lifecycle: Schema.optional(SessiondManagedLaunchLifecycle),
  /**
   * Phase 4D / Track A. Wait-monitor spec, meaningful only when
   * `lifecycle === "session"`. The schema accepts a wait spec for
   * any lifecycle; the daemon ignores it under
   * `lifecycle: "foreground"`. This keeps the schema purely
   * structural and leaves runtime semantics to sessiond.
   */
  wait: Schema.optional(LaunchSpec),
})
export type SessiondManagedLaunchStartRequest = Schema.Schema.Type<
  typeof SessiondManagedLaunchStartRequest
>

export const SessiondManagedLaunchStartResponse = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("accepted"),
    launchId: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("failed"),
    failureKind: LaunchFailureKind,
    message: Schema.String,
  }),
])
export type SessiondManagedLaunchStartResponse = Schema.Schema.Type<
  typeof SessiondManagedLaunchStartResponse
>

export const SessiondManagedLaunchEventType = Schema.Literals([
  "launch-accepted",
  "renderer-stopped",
  "child-running",
  "child-exited",
  "restoring",
  "home-ready",
  "idle-ready",
  "failed",
  "recovering",
  "terminated",
  // Phase 4D / Track A -- session-lifecycle event peers. Phase 4B
  // clients ignoring unknown event types continue to function; strict
  // decoders verifying Phase 4B-only sequences must list these in
  // their accept set explicitly.
  "launcher-exited",
  "wait-monitor-running",
  "wait-monitor-exited",
  "session-anchored",
  "seat-allocated",
  "seat-ready",
  "seat-connected",
  "seat-disconnected-reserved",
  "seat-reconnected",
  "seat-left",
  "seat-released",
  "seat-allocation-failed",
])
export type SessiondManagedLaunchEventType = Schema.Schema.Type<
  typeof SessiondManagedLaunchEventType
>

export const SessiondManagedLaunchTerminal = Schema.Struct({
  exitCode: Schema.NullOr(Schema.Number),
  signal: Schema.optional(Schema.String),
  failureKind: Schema.optional(LaunchFailureKind),
  stderrTail: Schema.optional(Schema.String),
})
export type SessiondManagedLaunchTerminal = Schema.Schema.Type<
  typeof SessiondManagedLaunchTerminal
>

export const SessiondManagedLaunchReadiness = Schema.Struct({
  status: Schema.Literals(["ok", "failed"]),
  evidence: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})
export type SessiondManagedLaunchReadiness = Schema.Schema.Type<
  typeof SessiondManagedLaunchReadiness
>

export const SessiondManagedLaunchEvent = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  sequence: Schema.Number,
  launchId: Schema.String,
  type: SessiondManagedLaunchEventType,
  at: Schema.String.check(isoDateTime),
  message: Schema.optional(Schema.String),
  terminal: Schema.optional(SessiondManagedLaunchTerminal),
  readiness: Schema.optional(SessiondManagedLaunchReadiness),
  seat: Schema.optional(SessiondManagedLaunchInputSeat),
})
export type SessiondManagedLaunchEvent = Schema.Schema.Type<
  typeof SessiondManagedLaunchEvent
>

export const SessiondManagedLaunchTerminateRequest = Schema.Struct({
  launchId: Schema.String,
  force: Schema.optional(Schema.Boolean),
})
export type SessiondManagedLaunchTerminateRequest = Schema.Schema.Type<
  typeof SessiondManagedLaunchTerminateRequest
>

export const SessiondManagedLaunchHomeToggleResponse = Schema.Union([
  Schema.Struct({ status: Schema.Literal("focused-hub") }),
  Schema.Struct({ status: Schema.Literal("focused-game") }),
  Schema.Struct({ status: Schema.Literal("no-live-game") }),
  Schema.Struct({ status: Schema.Literal("unsupported") }),
])
export type SessiondManagedLaunchHomeToggleResponse = Schema.Schema.Type<
  typeof SessiondManagedLaunchHomeToggleResponse
>

export const SessiondManagedLaunchTerminateResponse = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("accepted"),
    launchId: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("not-found"),
    launchId: Schema.String,
    message: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("already-terminal"),
    launchId: Schema.String,
  }),
])
export type SessiondManagedLaunchTerminateResponse = Schema.Schema.Type<
  typeof SessiondManagedLaunchTerminateResponse
>

const STRICT_DECODE = { onExcessProperty: "error" } as const

export const decodeSessiondManagedLaunchStatus = (
  input: unknown,
): SessiondManagedLaunchStatus =>
  Schema.decodeUnknownSync(SessiondManagedLaunchStatus)(input, STRICT_DECODE)

export const decodeSessiondManagedLaunchEvent = (
  input: unknown,
): SessiondManagedLaunchEvent =>
  Schema.decodeUnknownSync(SessiondManagedLaunchEvent)(input, STRICT_DECODE)

export const decodeSessiondManagedLaunchStartRequest = (
  input: unknown,
): SessiondManagedLaunchStartRequest =>
  Schema.decodeUnknownSync(SessiondManagedLaunchStartRequest)(
    input,
    STRICT_DECODE,
  )

export const decodeSessiondManagedLaunchStartResponse = (
  input: unknown,
): SessiondManagedLaunchStartResponse =>
  Schema.decodeUnknownSync(SessiondManagedLaunchStartResponse)(
    input,
    STRICT_DECODE,
  )

export const decodeSessiondManagedLaunchTerminateRequest = (
  input: unknown,
): SessiondManagedLaunchTerminateRequest =>
  Schema.decodeUnknownSync(SessiondManagedLaunchTerminateRequest)(
    input,
    STRICT_DECODE,
  )

export const decodeSessiondManagedLaunchHomeToggleResponse = (
  input: unknown,
): SessiondManagedLaunchHomeToggleResponse =>
  Schema.decodeUnknownSync(SessiondManagedLaunchHomeToggleResponse)(
    input,
    STRICT_DECODE,
  )

export const decodeSessiondManagedLaunchTerminateResponse = (
  input: unknown,
): SessiondManagedLaunchTerminateResponse =>
  Schema.decodeUnknownSync(SessiondManagedLaunchTerminateResponse)(
    input,
    STRICT_DECODE,
  )

export const TERMINAL_READINESS_EVENT_TYPES = [
  "home-ready",
  "idle-ready",
] as const satisfies ReadonlyArray<SessiondManagedLaunchEventType>

export type TerminalReadinessEventType =
  (typeof TERMINAL_READINESS_EVENT_TYPES)[number]

export const isTerminalReadinessEvent = (
  type: SessiondManagedLaunchEventType,
): type is TerminalReadinessEventType =>
  (TERMINAL_READINESS_EVENT_TYPES as ReadonlyArray<string>).includes(type)

export const LAUNCH_READY_MODES = [
  "home",
  "idle",
] as const satisfies ReadonlyArray<SessiondManagedLaunchMode>

export type LaunchReadyMode = (typeof LAUNCH_READY_MODES)[number]

export const isLaunchReadyMode = (
  mode: SessiondManagedLaunchMode,
): mode is LaunchReadyMode =>
  (LAUNCH_READY_MODES as ReadonlyArray<string>).includes(mode)

export const READINESS_GATE_BY_EVENT = {
  "home-ready": "sessiond-home-ready",
  "idle-ready": "sessiond-idle-ready",
} as const satisfies Record<TerminalReadinessEventType, string>

export type ReadinessGate =
  (typeof READINESS_GATE_BY_EVENT)[TerminalReadinessEventType]
