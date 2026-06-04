import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetLinkedResolutionPayload,
  SetLinkedResolutionResponse,
} from "./set-linked-resolution.rpc"

export const handleSetLinkedResolution = (
  payload: typeof SetLinkedResolutionPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setLinkedResolution(payload)
    return new SetLinkedResolutionResponse(response)
  })
