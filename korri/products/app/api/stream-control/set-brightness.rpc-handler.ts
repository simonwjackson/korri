import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetBrightnessPayload,
  SetBrightnessResponse,
} from "./set-brightness.rpc"

export const handleSetBrightness = (
  payload: typeof SetBrightnessPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setBrightness(payload)
    return new SetBrightnessResponse(response)
  })
