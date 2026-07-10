import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class ServerStatusPayload extends Schema.Class<ServerStatusPayload>(
  "ServerStatusPayload",
)({}) {}

const ServerRunnerMode = Schema.Literals([
  "idle",
  "starting",
  "running",
  "stopping",
  "exited",
  "failed",
])

export class ServerRunnerStatus extends Schema.Class<ServerRunnerStatus>(
  "ServerRunnerStatus",
)({
  mode: ServerRunnerMode,
  observedAt: Schema.String,
  stale: Schema.Boolean,
}) {}

const SessiondLifecycleMode = Schema.Literals([
  "stopped",
  "starting",
  "home",
  "idle",
  "launching",
  "game",
  "restoring",
  "recovering",
])

/**
 * Phase 4D / Track A finishing follow-up. Operator-facing session
 * sub-phase forwarded from sessiond's `/managed-launch/status` --
 * lets clients distinguish launcher-running (`running`), wait-monitor
 * (`wait-monitor`), and session-anchored (`anchored`) launches
 * without expanding the coarse `mode` literal. Optional; older
 * sessiond builds omit it.
 */
const SessiondLifecyclePhase = Schema.Literals([
  "launching",
  "running",
  "wait-monitor",
  "anchored",
  "frozen",
  "restoring",
])

export class SessiondLifecycleActive extends Schema.Class<SessiondLifecycleActive>(
  "SessiondLifecycleActive",
)({
  launchId: Schema.String,
  mode: SessiondLifecycleMode,
  phase: Schema.optional(SessiondLifecyclePhase),
}) {}

export class SessiondLifecycleSummary extends Schema.Class<SessiondLifecycleSummary>(
  "SessiondLifecycleSummary",
)({
  mode: SessiondLifecycleMode,
  active: Schema.optional(SessiondLifecycleActive),
  restoreAttempts: Schema.Number,
  failureReason: Schema.optional(Schema.String),
}) {}

const ProviderLifecycleHealth = Schema.Literals([
  "unavailable",
  "starting",
  "running",
  "degraded",
  "stopped",
])

const ProviderLifecycleStatus = Schema.Literals([
  "active",
  "blocked",
  "terminal",
  "failed",
  "stuck",
])

const ProviderLifecycleConfidence = Schema.Literals([
  "confirmed",
  "hint",
  "unknown",
  "low",
])

const ProviderLifecycleNextActionHint = Schema.Literals([
  "wait",
  "interact-with-steam",
  "retry",
  "inspect-diagnostics",
  "none",
])

export class ProviderLifecycleSummary extends Schema.Class<ProviderLifecycleSummary>(
  "ProviderLifecycleSummary",
)({
  providerId: Schema.String,
  observerHealth: ProviderLifecycleHealth,
  lifecycleStatus: ProviderLifecycleStatus,
  providerPhase: Schema.String,
  displayMessage: Schema.String,
  confidence: ProviderLifecycleConfidence,
  nextActionHint: ProviderLifecycleNextActionHint,
  appId: Schema.optional(Schema.String),
  launchId: Schema.optional(Schema.String),
  playableId: Schema.optional(Schema.String),
  lastProgressAt: Schema.optional(Schema.String),
}) {}

export class ServerStatusResponse extends Schema.Class<ServerStatusResponse>(
  "ServerStatusResponse",
)({
  serverId: Schema.String,
  displayName: Schema.String,
  protocolVersion: Schema.Literal("1"),
  capabilities: Schema.Array(Schema.String),
  status: Schema.Literals(["available", "stream-unavailable"]),
  streamControl: Schema.Literals(["enabled", "disabled"]),
  catalog: Schema.Literals(["available", "unavailable"]),
  runner: Schema.optional(ServerRunnerStatus),
  sessiond: Schema.optional(SessiondLifecycleSummary),
  sessiondUnavailable: Schema.optional(Schema.Boolean),
  providerLifecycle: Schema.optional(ProviderLifecycleSummary),
  message: Schema.optional(Schema.String),
}) {}

export const ServerStatusRpc = Rpc.make("app.server.status", {
  payload: ServerStatusPayload,
  success: ServerStatusResponse,
  error: ApiError,
})
