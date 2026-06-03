import { Effect } from "effect"
import {
  type GetStreamControlControlsPayload,
  GetStreamControlControlsResponse,
} from "./get-controls.rpc"
import { StreamControl } from "./service"

export const handleGetStreamControlControls = (
  _payload: typeof GetStreamControlControlsPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.controls()
    return new GetStreamControlControlsResponse(response)
  })
