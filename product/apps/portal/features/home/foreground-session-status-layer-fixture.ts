import { foregroundSessionGateStateFromSnapshot } from "@platform/stream/foreground-session-gate-state"
import type { ForegroundSessionStatusSnapshot } from "@platform/stream/foreground-session-status"
import { ForegroundSessionStatusSource } from "@platform/stream/foreground-session-status-source"
import { Effect, Layer } from "effect"

export const idleForegroundSessionStatusSnapshot = {
  schemaVersion: 1,
  serverTimestamp: new Date(0).toISOString(),
  state: "IdleReady",
  recentEvents: [],
} satisfies ForegroundSessionStatusSnapshot

export function createForegroundSessionStatusLayerFixture(
  snapshot: ForegroundSessionStatusSnapshot = idleForegroundSessionStatusSnapshot,
) {
  return Layer.succeed(ForegroundSessionStatusSource)({
    get: () => Effect.succeed(foregroundSessionGateStateFromSnapshot(snapshot)),
  })
}

export const ForegroundSessionStatusLayerFixture =
  createForegroundSessionStatusLayerFixture()
