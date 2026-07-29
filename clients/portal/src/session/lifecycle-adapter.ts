import type {
  KorriSessionBridgeSurface,
  StreamFailureReason,
  StreamLifecycleEvent,
  StreamStageId,
} from "@contracts/bridge/korri-native-bridge"
import { SessionLifecycleState } from "./state"

/**
 * Session lifecycle adapter: implements the treaty's pull-then-push overlay
 * contract (see contracts/bridge/korri-native-bridge.ts). On start it pulls
 * `lifecycleSnapshot()` and folds the event log, then registers the
 * `window.__korriSessionEvent` global for pushed events. Malformed payloads
 * are dropped at this seam; the screen only ever sees the folded ADT.
 */

const GLOBAL_NAME = "__korriSessionEvent"

const stages = new Set<StreamStageId>([
  "launching-app",
  "initializing",
  "handshaking",
  "establishing-streams",
])

const reasons = new Set<StreamFailureReason>([
  "AppLaunchFailed",
  "HostUnreachable",
  "PermissionDenied",
  "DecoderInitFailed",
  "NoVideoTraffic",
  "ConnectionLost",
  "Unknown",
])

const isStage = (value: unknown): value is StreamStageId =>
  typeof value === "string" && stages.has(value as StreamStageId)

const isReason = (value: unknown): value is StreamFailureReason =>
  typeof value === "string" && reasons.has(value as StreamFailureReason)

const parseEventValue = (value: unknown): StreamLifecycleEvent | null => {
  if (typeof value !== "object" || value === null) return null
  const event = value as Partial<StreamLifecycleEvent> & {
    readonly detail?: unknown
  }
  const detail = typeof event.detail === "string" ? event.detail : undefined

  if (event.type === "stage-starting" || event.type === "stage-complete") {
    if (!isStage(event.stage)) return null
    return detail === undefined
      ? { type: event.type, stage: event.stage }
      : { type: event.type, stage: event.stage, detail }
  }
  if (event.type === "connected") return { type: "connected" }
  if (event.type === "failed") {
    if (!isReason(event.reason)) return null
    if (!isStage(event.stage)) return null
    if (typeof event.errorCode !== "number") return null
    return detail === undefined
      ? {
          type: "failed",
          reason: event.reason,
          stage: event.stage,
          errorCode: event.errorCode,
        }
      : {
          type: "failed",
          reason: event.reason,
          stage: event.stage,
          errorCode: event.errorCode,
          detail,
        }
  }
  if (event.type === "terminated") {
    if (typeof event.graceful !== "boolean") return null
    if (!isReason(event.reason)) return null
    if (typeof event.errorCode !== "number") return null
    return {
      type: "terminated",
      graceful: event.graceful,
      reason: event.reason,
      errorCode: event.errorCode,
    }
  }
  return null
}

/** Parse a pushed wire event, returning null for anything malformed. */
export function parseStreamLifecycleEvent(
  json: string,
): StreamLifecycleEvent | null {
  try {
    return parseEventValue(JSON.parse(json))
  } catch {
    return null
  }
}

/** Fold a snapshot body into events, dropping anything malformed. */
function parseSnapshotEvents(json: string): readonly StreamLifecycleEvent[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return []
  }
  if (typeof value !== "object" || value === null) return []
  const events = (value as { readonly events?: unknown }).events
  if (!Array.isArray(events)) return []
  return events.flatMap(entry => {
    const parsed = parseEventValue(entry)
    return parsed === null ? [] : [parsed]
  })
}

export interface SessionLifecycleAdapter {
  start(onState: (state: SessionLifecycleState) => void): () => void
}

export function createSessionLifecycleAdapter(
  surface: KorriSessionBridgeSurface,
): SessionLifecycleAdapter {
  return {
    start(onState) {
      let state = SessionLifecycleState.fromEvents(
        parseSnapshotEvents(surface.lifecycleSnapshot()),
      )
      onState(state)

      const host = window as unknown as Record<string, unknown>
      host[GLOBAL_NAME] = (json: string) => {
        const event = parseStreamLifecycleEvent(json)
        if (event === null) return
        state = SessionLifecycleState.applyEvent(state, event)
        onState(state)
      }
      return () => {
        delete host[GLOBAL_NAME]
      }
    },
  }
}
