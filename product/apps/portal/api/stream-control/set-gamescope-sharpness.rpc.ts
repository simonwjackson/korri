import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeSharpness,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetGamescopeSharpnessPayload extends Schema.Class<SetGamescopeSharpnessPayload>(
  "SetGamescopeSharpnessPayload",
)({ sharpness: RuntimeSharpness }) {}

export class SetGamescopeSharpnessResponse extends Schema.Class<SetGamescopeSharpnessResponse>(
  "SetGamescopeSharpnessResponse",
)(StreamControlCommandResponseFields) {}

export const SetGamescopeSharpnessRpc = Rpc.make(
  "app.stream-control.gamescope-sharpness.set",
  {
    payload: SetGamescopeSharpnessPayload,
    success: SetGamescopeSharpnessResponse,
    error: ApiError,
  },
)
