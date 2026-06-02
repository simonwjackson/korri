import { Effect } from "effect"
import {
  type GetStreamControlStatePayload,
  GetStreamControlStateResponse,
} from "./get-state.rpc"
import { StreamControl } from "./service"

export const handleGetStreamControlState = (
  _payload: typeof GetStreamControlStatePayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.state()
    return new GetStreamControlStateResponse(response)
  })
