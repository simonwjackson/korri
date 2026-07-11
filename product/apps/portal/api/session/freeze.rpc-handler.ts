import { KorriControl } from "@platform/control/korri-control"
import { Effect } from "effect"
import type { FreezeSessionPayload } from "./freeze.rpc"

export const handleFreezeSession = (
  payload: typeof FreezeSessionPayload.Type,
) =>
  Effect.gen(function* () {
    const control = yield* KorriControl
    return yield* control.freezeSession({
      ...(payload.launchId !== undefined ? { launchId: payload.launchId } : {}),
    })
  })
