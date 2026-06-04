import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeBitrateKbps,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetMoonlightBitratePayload extends Schema.Class<SetMoonlightBitratePayload>(
  "SetMoonlightBitratePayload",
)({ bitrateKbps: RuntimeBitrateKbps }) {}

export class SetMoonlightBitrateResponse extends Schema.Class<SetMoonlightBitrateResponse>(
  "SetMoonlightBitrateResponse",
)(StreamControlCommandResponseFields) {}

export const SetMoonlightBitrateRpc = Rpc.make(
  "app.stream-control.moonlight-bitrate.set",
  {
    payload: SetMoonlightBitratePayload,
    success: SetMoonlightBitrateResponse,
    error: ApiError,
  },
)
