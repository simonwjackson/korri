import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeGamescopeFps,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetGamescopeFpsPayload extends Schema.Class<SetGamescopeFpsPayload>(
  "SetGamescopeFpsPayload",
)({ fps: RuntimeGamescopeFps }) {}

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
