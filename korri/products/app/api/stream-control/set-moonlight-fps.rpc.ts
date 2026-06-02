import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import { RuntimeFps, StreamControlCommandResponseFields } from "./rpc-schemas"

export class SetMoonlightFpsPayload extends Schema.Class<SetMoonlightFpsPayload>(
  "SetMoonlightFpsPayload",
)({ fps: RuntimeFps }) {}

export class SetMoonlightFpsResponse extends Schema.Class<SetMoonlightFpsResponse>(
  "SetMoonlightFpsResponse",
)(StreamControlCommandResponseFields) {}

export const SetMoonlightFpsRpc = Rpc.make(
  "app.stream-control.moonlight-fps.set",
  {
    payload: SetMoonlightFpsPayload,
    success: SetMoonlightFpsResponse,
    error: ApiError,
  },
)
