import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import { RuntimeFps, StreamControlCommandResponseFields } from "./rpc-schemas"

export class SetGamescopeFpsPayload extends Schema.Class<SetGamescopeFpsPayload>(
  "SetGamescopeFpsPayload",
)({ fps: RuntimeFps }) {}

export class SetGamescopeFpsResponse extends Schema.Class<SetGamescopeFpsResponse>(
  "SetGamescopeFpsResponse",
)(StreamControlCommandResponseFields) {}

export const SetGamescopeFpsRpc = Rpc.make(
  "app.stream-control.gamescope-fps.set",
  {
    payload: SetGamescopeFpsPayload,
    success: SetGamescopeFpsResponse,
    error: ApiError,
  },
)
