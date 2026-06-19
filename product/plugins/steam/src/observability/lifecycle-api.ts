import { Schema } from "effect"
import { sanitizeSteamEvidenceExcerpt } from "./evidence-sanitizer"
import type {
  SteamLifecycleEvent,
  SteamLifecycleSummary,
} from "./lifecycle-events"
import {
  collectInstalledSteamLifecycle,
  openInstalledSteamLaunchCorrelation,
  type SteamLifecycleCollectInput,
} from "./log-observer"

const RESPONSE_EXCERPT_LIMIT = 240

const SteamObserverState = Schema.Literals([
  "unavailable",
  "starting",
  "running",
  "degraded",
  "stopped",
])
const SteamLifecyclePhase = Schema.Literals([
  "preparing",
  "downloading",
  "shader-preparing",
  "install-script",
  "cloud-sync",
  "waiting-user-prompt",
  "creating-process",
  "waiting-window",
  "running",
  "stopping",
  "cleanup",
  "stopped",
  "failed",
  "stuck",
])
const SteamLifecycleStatus = Schema.Literals([
  "active",
  "blocked",
  "terminal",
  "failed",
  "stuck",
])
const SteamLifecycleSeverity = Schema.Literals(["info", "warning", "error"])
const SteamConfidence = Schema.Literals(["confirmed", "hint", "unknown", "low"])
const SteamNextActionHint = Schema.Literals([
  "wait",
  "interact-with-steam",
  "retry",
  "inspect-diagnostics",
  "none",
])
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

export class SteamLifecycleObserver extends Schema.Class<SteamLifecycleObserver>(
  "SteamLifecycleObserver",
)({
  state: SteamObserverState,
  logDir: Schema.optional(Schema.String),
  watchedFiles: Schema.Array(Schema.String),
  activeFiles: Schema.Array(Schema.String),
  missingFiles: Schema.Array(Schema.String),
  lastError: Schema.optional(Schema.String),
  lastLineAt: Schema.optional(Schema.String),
}) {}

export class SteamLifecycleSummaryResponse extends Schema.Class<SteamLifecycleSummaryResponse>(
  "SteamLifecycleSummaryResponse",
)({
  providerId: Schema.Literal("@korri:steam"),
  observerHealth: SteamObserverState,
  lifecycleStatus: SteamLifecycleStatus,
  providerPhase: SteamLifecyclePhase,
  displayMessage: Schema.String,
  confidence: SteamConfidence,
  nextActionHint: SteamNextActionHint,
  appId: Schema.optional(Schema.String),
  launchId: Schema.optional(Schema.String),
  playableId: Schema.optional(Schema.String),
  lastProgressAt: Schema.optional(Schema.String),
}) {}

export class SteamLifecycleEvidenceResponse extends Schema.Class<SteamLifecycleEvidenceResponse>(
  "SteamLifecycleEvidenceResponse",
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

export class SteamLifecycleEventResponse extends Schema.Class<SteamLifecycleEventResponse>(
  "SteamLifecycleEventResponse",
)({
  providerId: Schema.Literal("@korri:steam"),
  sequence: Schema.Number,
  observedAt: Schema.String,
  appId: Schema.String,
  launchId: Schema.optional(Schema.String),
  playableId: Schema.optional(Schema.String),
  phase: SteamLifecyclePhase,
  status: SteamLifecycleStatus,
  confidence: SteamConfidence,
  severity: SteamLifecycleSeverity,
  displayMessage: Schema.String,
  nextActionHint: SteamNextActionHint,
  source: SteamLogSource,
  evidence: SteamLifecycleEvidenceResponse,
  steam: Schema.Record(Schema.String, Schema.Unknown),
}) {}

export class SteamLifecycleCollectResponse extends Schema.Class<SteamLifecycleCollectResponse>(
  "SteamLifecycleCollectResponse",
)({
  observer: SteamLifecycleObserver,
  summary: Schema.optional(SteamLifecycleSummaryResponse),
  events: Schema.Array(SteamLifecycleEventResponse),
}) {}

export function collectSteamLifecycle(
  input?: SteamLifecycleCollectInput,
): SteamLifecycleCollectResponse {
  const collected = collectInstalledSteamLifecycle(input)
  return new SteamLifecycleCollectResponse({
    observer: new SteamLifecycleObserver({
      state: collected.observer.state,
      ...(collected.observer.logDir
        ? { logDir: sanitize(collected.observer.logDir) }
        : {}),
      watchedFiles: [...collected.observer.watchedFiles],
      activeFiles: [...collected.observer.activeFiles],
      missingFiles: [...collected.observer.missingFiles],
      ...(collected.observer.lastError
        ? { lastError: sanitize(collected.observer.lastError) }
        : {}),
      ...(collected.observer.lastLineAt
        ? { lastLineAt: collected.observer.lastLineAt }
        : {}),
    }),
    ...(collected.summary
      ? { summary: summaryToResponse(collected.summary) }
      : {}),
    events: collected.events.map(eventToResponse),
  })
}

export function openSteamLifecycleCorrelation(input: unknown): void {
  const record = decodeRecord(input)
  const appId = decodeString(record.appId, "appId")
  const launchId = decodeString(record.launchId, "launchId")
  const playableId =
    record.playableId === undefined
      ? undefined
      : decodeString(record.playableId, "playableId")
  openInstalledSteamLaunchCorrelation({
    appId,
    launchId,
    ...(playableId ? { playableId } : {}),
  })
}

function summaryToResponse(
  summary: SteamLifecycleSummary,
): SteamLifecycleSummaryResponse {
  return new SteamLifecycleSummaryResponse({
    ...summary,
    displayMessage: sanitize(summary.displayMessage),
  })
}

function eventToResponse(
  event: SteamLifecycleEvent,
): SteamLifecycleEventResponse {
  return new SteamLifecycleEventResponse({
    ...event,
    displayMessage: sanitize(event.displayMessage),
    evidence: new SteamLifecycleEvidenceResponse({
      ...event.evidence,
      logFile: sanitize(event.evidence.logFile),
      excerpt: sanitize(event.evidence.excerpt),
    }),
    steam: Object.fromEntries(
      Object.entries(event.steam).map(([key, value]) => [
        key,
        typeof value === "string" ? sanitize(value) : value,
      ]),
    ),
  })
}

function sanitize(value: unknown): string {
  return sanitizeSteamEvidenceExcerpt(value, {
    maxLength: RESPONSE_EXCERPT_LIMIT,
  })
}

function decodeRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error("Steam lifecycle correlation input must be an object")
}

function decodeString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(
    `Steam lifecycle correlation ${field} must be a non-empty string`,
  )
}
