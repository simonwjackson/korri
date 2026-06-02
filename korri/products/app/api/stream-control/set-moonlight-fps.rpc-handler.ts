import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetMoonlightFpsPayload,
  SetMoonlightFpsResponse,
} from "./set-moonlight-fps.rpc"

export const handleSetMoonlightFps = (
  payload: typeof SetMoonlightFpsPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setMoonlightFps(payload)
    return new SetMoonlightFpsResponse(response)
  })
