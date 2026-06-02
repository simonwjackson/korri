import { Effect } from "effect"
import {
  type GetStreamControlConfigPayload,
  GetStreamControlConfigResponse,
} from "./get-config.rpc"
import { StreamControl } from "./service"

export const handleGetStreamControlConfig = (
  _payload: typeof GetStreamControlConfigPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.config()
    return new GetStreamControlConfigResponse(response)
  })
