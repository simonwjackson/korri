import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class SteamStatusPayload extends Schema.Class<SteamStatusPayload>(
  "SteamStatusPayload",
)({}) {}

const SteamObserverState = Schema.Literals([
  "unavailable",
  "starting",
  "running",
  "degraded",
  "stopped",
])

const SteamLaunchStatus = Schema.Literals([
  "Preparing",
  "Launching",
  "Running",
  "Stopping",
  "Stopped",
  "Stuck",
])

const SteamConfidence = Schema.Literals(["confirmed", "hint", "unknown", "low"])

const SteamOwnership = Schema.Literals(["korri-correlated", "steam-only"])

const SteamLogSource = Schema.Literals([
  "content_log",
  "gameprocess_log",
  "console_log",
  "shader_log",
  "compat_log",
  "appinfo_log",
  "guest_log",
  "wrapper_log",
  "auxiliary_log",
])

export class SteamStatusObserver extends Schema.Class<SteamStatusObserver>(
  "SteamStatusObserver",
)({
  state: SteamObserverState,
  logDir: Schema.optional(Schema.String),
  watchedFiles: Schema.Array(Schema.String),
  activeFiles: Schema.Array(Schema.String),
  missingFiles: Schema.Array(Schema.String),
  lastError: Schema.optional(Schema.String),
  lastLineAt: Schema.optional(Schema.String),
}) {}

export class SteamStatusEvidence extends Schema.Class<SteamStatusEvidence>(
  "SteamStatusEvidence",
)({
  source: SteamLogSource,
  logFile: Schema.String,
  steamTimestamp: Schema.optional(Schema.String),
  observedAt: Schema.String,
  sequence: Schema.Number,
  offset: Schema.optional(Schema.Number),
  confidence: SteamConfidence,
  parser: Schema.String,
  excerpt: Schema.String,
}) {}

export class SteamStatusRemovedPid extends Schema.Class<SteamStatusRemovedPid>(
  "SteamStatusRemovedPid",
)({
  pid: Schema.Number,
  exitCode: Schema.Number,
}) {}

export class SteamStatusFacet extends Schema.Class<SteamStatusFacet>(
  "SteamStatusFacet",
)({
  appState: Schema.optional(Schema.String),
  running: Schema.optional(Schema.Boolean),
  actionId: Schema.optional(Schema.String),
  lastTask: Schema.optional(Schema.String),
  taskHistory: Schema.Array(Schema.String),
  trackedPids: Schema.Array(Schema.Number),
  removedPids: Schema.Array(SteamStatusRemovedPid),
  commandExcerpt: Schema.optional(Schema.String),
}) {}

export class SteamStatusSnapshot extends Schema.Class<SteamStatusSnapshot>(
  "SteamStatusSnapshot",
)({
  appId: Schema.String,
  status: SteamLaunchStatus,
  confidence: SteamConfidence,
  ownership: SteamOwnership,
  firstObservedAt: Schema.String,
  lastObservedAt: Schema.String,
  lastProgressAt: Schema.String,
  steam: SteamStatusFacet,
  evidence: Schema.Array(SteamStatusEvidence),
}) {}

export class SteamStatusResponse extends Schema.Class<SteamStatusResponse>(
  "SteamStatusResponse",
)({
  observer: SteamStatusObserver,
  active: Schema.optional(SteamStatusSnapshot),
  latest: Schema.optional(SteamStatusSnapshot),
  recentEvidence: Schema.Array(SteamStatusEvidence),
}) {}

export const SteamStatusRpc = Rpc.make("app.steam.status", {
  payload: SteamStatusPayload,
  success: SteamStatusResponse,
  error: ApiError,
})
