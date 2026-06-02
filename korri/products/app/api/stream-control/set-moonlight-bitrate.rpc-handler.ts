import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetMoonlightBitratePayload,
  SetMoonlightBitrateResponse,
} from "./set-moonlight-bitrate.rpc"

export const handleSetMoonlightBitrate = (
  payload: typeof SetMoonlightBitratePayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setMoonlightBitrate(payload)
    return new SetMoonlightBitrateResponse(response)
  })
