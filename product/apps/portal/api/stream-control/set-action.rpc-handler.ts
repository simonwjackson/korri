import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetStreamControlActionPayload,
  SetStreamControlActionResponse,
} from "./set-action.rpc"

export const handleSetStreamControlAction = (
  payload: typeof SetStreamControlActionPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.applyAction(payload)
    return new SetStreamControlActionResponse(response)
  })
