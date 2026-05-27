import { Schema } from "effect"
import { LaunchFailureKind, LaunchSpec } from "./launcher"

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

export const SessiondManagedLaunchActive = Schema.Struct({
  launchId: Schema.String,
  mode: SessiondManagedLaunchMode,
  phase: Schema.optional(SessiondManagedLaunchPhase),
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
