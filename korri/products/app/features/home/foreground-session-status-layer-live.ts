import { createForegroundSessionStatusClient } from "@app/stream/foreground-session-status-client"
import { foregroundSessionGateStateFromSnapshot } from "@shared/stream/foreground-session-gate-state"
import { ForegroundSessionStatusSource } from "@shared/stream/foreground-session-status-source"
import { Effect, Layer } from "effect"

export const ForegroundSessionStatusLayerLive = Layer.succeed(
  ForegroundSessionStatusSource,
)({
  get: () =>
    Effect.promise(async () => {
      const result =
        await createForegroundSessionStatusClient().fetchStatusResult()
      if (result._tag === "Failure") {
        return foregroundSessionGateStateFromSnapshot({
          _tag: "LoadError",
          message: result.message,
        })
      }
      return foregroundSessionGateStateFromSnapshot(result.status)
    }),
})
