import { Effect } from "effect"
import { StreamControl } from "./service"
import {
  type SetGamescopeFilterPayload,
  SetGamescopeFilterResponse,
} from "./set-gamescope-filter.rpc"

export const handleSetGamescopeFilter = (
  payload: typeof SetGamescopeFilterPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeFilter(payload)
    return new SetGamescopeFilterResponse(response)
  })
