import { KorriControl } from "@platform/control/korri-control"
import { Effect } from "effect"
import type { StopSessionPayload } from "./stop.rpc"

export const handleStopSession = (payload: typeof StopSessionPayload.Type) =>
  Effect.gen(function* () {
    const control = yield* KorriControl
    return yield* control.stopSession({
      ...(payload.force !== undefined ? { force: payload.force } : {}),
      ...(payload.confirmed !== undefined
        ? { confirmed: payload.confirmed }
        : {}),
    })
  })
