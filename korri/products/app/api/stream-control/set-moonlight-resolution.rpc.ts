import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeMoonlightResolutionHeight,
  RuntimeMoonlightResolutionWidth,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetMoonlightResolutionPayload extends Schema.Class<SetMoonlightResolutionPayload>(
  "SetMoonlightResolutionPayload",
)({
  width: RuntimeMoonlightResolutionWidth,
  height: RuntimeMoonlightResolutionHeight,
}) {}

export class SetMoonlightResolutionResponse extends Schema.Class<SetMoonlightResolutionResponse>(
  "SetMoonlightResolutionResponse",
)(StreamControlCommandResponseFields) {}

export const SetMoonlightResolutionRpc = Rpc.make(
  "app.stream-control.moonlight-resolution.set",
  {
    payload: SetMoonlightResolutionPayload,
    success: SetMoonlightResolutionResponse,
    error: ApiError,
  },
)
