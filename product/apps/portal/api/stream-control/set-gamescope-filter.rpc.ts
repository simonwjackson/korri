import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  GamescopeScalingFilter,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetGamescopeFilterPayload extends Schema.Class<SetGamescopeFilterPayload>(
  "SetGamescopeFilterPayload",
)({ filter: GamescopeScalingFilter }) {}

export class SetGamescopeFilterResponse extends Schema.Class<SetGamescopeFilterResponse>(
  "SetGamescopeFilterResponse",
)(StreamControlCommandResponseFields) {}

export const SetGamescopeFilterRpc = Rpc.make(
  "app.stream-control.gamescope-filter.set",
  {
    payload: SetGamescopeFilterPayload,
    success: SetGamescopeFilterResponse,
    error: ApiError,
  },
)
