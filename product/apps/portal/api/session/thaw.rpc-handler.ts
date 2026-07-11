import { KorriControl } from "@platform/control/korri-control"
import { Effect } from "effect"
import type { ThawSessionPayload } from "./thaw.rpc"

export const handleThawSession = (payload: typeof ThawSessionPayload.Type) =>
  Effect.gen(function* () {
    const control = yield* KorriControl
    return yield* control.thawSession({
      ...(payload.launchId !== undefined ? { launchId: payload.launchId } : {}),
    })
  })
