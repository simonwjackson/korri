import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetGamescopeModePayload,
  SetGamescopeModeResponse,
} from "./set-gamescope-mode.rpc"

export const handleSetGamescopeMode = (
  payload: typeof SetGamescopeModePayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeMode(payload)
    return new SetGamescopeModeResponse(response)
  })
