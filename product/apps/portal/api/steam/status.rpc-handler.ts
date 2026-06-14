import {
  clampSteamEvidenceArray,
  sanitizeSteamEvidenceExcerpt,
} from "@product/services/device/steam-evidence-sanitizer"
import type {
  SteamLaunchSnapshot,
  SteamLaunchStatus,
} from "@product/services/device/steam-launch-state"
import { getInstalledSteamLogObserverStatus } from "@product/services/device/steam-log-observer"
import type { SteamSignalEvidence } from "@product/services/device/steam-log-signals"
import { Effect } from "effect"
import {
  SteamStatusEvidence,
  SteamStatusFacet,
  SteamStatusObserver,
  type SteamStatusPayload,
  SteamStatusRemovedPid,
  SteamStatusResponse,
  SteamStatusSnapshot,
} from "./status.rpc"

const RESPONSE_EVIDENCE_LIMIT = 50
const RESPONSE_EXCERPT_LIMIT = 240

export const handleSteamStatus = (_payload: typeof SteamStatusPayload.Type) =>
  Effect.succeed(buildSteamStatusResponse())

function buildSteamStatusResponse(): SteamStatusResponse {
  const status = getInstalledSteamLogObserverStatus()
  return new SteamStatusResponse({
    observer: new SteamStatusObserver({
      state: status.health.state,
      ...(status.health.logDir
        ? { logDir: sanitizeSteamEvidenceExcerpt(status.health.logDir) }
        : {}),
      watchedFiles: [...status.health.watchedFiles],
      activeFiles: [...status.health.activeFiles],
      missingFiles: [...status.health.missingFiles],
      ...(status.health.lastError
        ? {
            lastError: sanitizeSteamEvidenceExcerpt(status.health.lastError, {
              maxLength: RESPONSE_EXCERPT_LIMIT,
            }),
          }
        : {}),
      ...(status.health.lastLineAt
        ? { lastLineAt: status.health.lastLineAt }
        : {}),
    }),
    ...(status.active ? { active: snapshotToResponse(status.active) } : {}),
    ...(status.latest ? { latest: snapshotToResponse(status.latest) } : {}),
    recentEvidence: evidenceToResponse(status.recentEvidence),
  })
}

function snapshotToResponse(
  snapshot: SteamLaunchSnapshot,
): SteamStatusSnapshot {
  return new SteamStatusSnapshot({
    appId: snapshot.appId,
    status: flattenStatus(snapshot.status),
    confidence: snapshot.confidence,
    ownership: snapshot.ownership,
    firstObservedAt: snapshot.firstObservedAt,
    lastObservedAt: snapshot.lastObservedAt,
    lastProgressAt: snapshot.lastProgressAt,
    steam: new SteamStatusFacet({
      ...(snapshot.steam.appState ? { appState: snapshot.steam.appState } : {}),
      ...(snapshot.steam.running === undefined
        ? {}
        : { running: snapshot.steam.running }),
      ...(snapshot.steam.actionId ? { actionId: snapshot.steam.actionId } : {}),
      ...(snapshot.steam.lastTask ? { lastTask: snapshot.steam.lastTask } : {}),
      taskHistory: [...clampSteamEvidenceArray(snapshot.steam.taskHistory, 20)],
      trackedPids: [...clampSteamEvidenceArray(snapshot.steam.trackedPids, 50)],
      removedPids: clampSteamEvidenceArray(snapshot.steam.removedPids, 50).map(
        pid => new SteamStatusRemovedPid(pid),
      ),
      ...(snapshot.steam.commandExcerpt
        ? {
            commandExcerpt: sanitizeSteamEvidenceExcerpt(
              snapshot.steam.commandExcerpt,
              { maxLength: RESPONSE_EXCERPT_LIMIT },
            ),
          }
        : {}),
    }),
    evidence: evidenceToResponse(snapshot.evidence),
  })
}

function evidenceToResponse(
  evidence: readonly SteamSignalEvidence[],
): readonly SteamStatusEvidence[] {
  return clampSteamEvidenceArray(evidence, RESPONSE_EVIDENCE_LIMIT).map(
    entry =>
      new SteamStatusEvidence({
        source: entry.source,
        logFile: entry.logFile,
        ...(entry.steamTimestamp
          ? { steamTimestamp: entry.steamTimestamp }
          : {}),
        observedAt: entry.observedAt,
        sequence: entry.sequence,
        ...(entry.offset === undefined ? {} : { offset: entry.offset }),
        confidence: entry.confidence,
        parser: entry.parser,
        excerpt: sanitizeSteamEvidenceExcerpt(entry.excerpt, {
          maxLength: RESPONSE_EXCERPT_LIMIT,
        }),
      }),
  )
}

function flattenStatus(
  status: SteamLaunchStatus,
): typeof SteamStatusSnapshot.Type.status {
  return status._tag
}
