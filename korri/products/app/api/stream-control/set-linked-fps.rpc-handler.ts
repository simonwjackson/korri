import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetLinkedFpsPayload,
  SetLinkedFpsResponse,
} from "./set-linked-fps.rpc"

export const handleSetLinkedFps = (payload: typeof SetLinkedFpsPayload.Type) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setLinkedFps(payload)
    return new SetLinkedFpsResponse(response)
  })
