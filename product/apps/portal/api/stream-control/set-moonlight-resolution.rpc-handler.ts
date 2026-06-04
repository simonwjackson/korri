import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetMoonlightResolutionPayload,
  SetMoonlightResolutionResponse,
} from "./set-moonlight-resolution.rpc"

export const handleSetMoonlightResolution = (
  payload: typeof SetMoonlightResolutionPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setMoonlightResolution(payload)
    return new SetMoonlightResolutionResponse(response)
  })
