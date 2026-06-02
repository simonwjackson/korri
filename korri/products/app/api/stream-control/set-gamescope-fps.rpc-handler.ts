import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetGamescopeFpsPayload,
  SetGamescopeFpsResponse,
} from "./set-gamescope-fps.rpc"

export const handleSetGamescopeFps = (
  payload: typeof SetGamescopeFpsPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeFps(payload)
    return new SetGamescopeFpsResponse(response)
  })
