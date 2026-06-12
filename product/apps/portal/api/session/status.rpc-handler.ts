import { KorriControl } from "@platform/control/korri-control"
import { Effect } from "effect"
import type { SessionStatusPayload } from "./status.rpc"

export const handleSessionStatus = (
  _payload: typeof SessionStatusPayload.Type,
) =>
  Effect.gen(function* () {
    const control = yield* KorriControl
    return yield* control.sessionStatus()
  })
