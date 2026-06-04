import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetGamescopeSharpnessPayload,
  SetGamescopeSharpnessResponse,
} from "./set-gamescope-sharpness.rpc"

export const handleSetGamescopeSharpness = (
  payload: typeof SetGamescopeSharpnessPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeSharpness(payload)
    return new SetGamescopeSharpnessResponse(response)
  })
