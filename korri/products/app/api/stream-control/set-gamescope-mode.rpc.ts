import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeResolutionDimension,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetGamescopeModePayload extends Schema.Class<SetGamescopeModePayload>(
  "SetGamescopeModePayload",
)({
  width: RuntimeResolutionDimension,
  height: RuntimeResolutionDimension,
}) {}

export class SetGamescopeModeResponse extends Schema.Class<SetGamescopeModeResponse>(
  "SetGamescopeModeResponse",
)(StreamControlCommandResponseFields) {}

export const SetGamescopeModeRpc = Rpc.make(
  "app.stream-control.gamescope-mode.set",
  {
    payload: SetGamescopeModePayload,
    success: SetGamescopeModeResponse,
    error: ApiError,
  },
)
