import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeResolutionDimension,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetMoonlightResolutionPayload extends Schema.Class<SetMoonlightResolutionPayload>(
  "SetMoonlightResolutionPayload",
)({
  width: RuntimeResolutionDimension,
  height: RuntimeResolutionDimension,
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
