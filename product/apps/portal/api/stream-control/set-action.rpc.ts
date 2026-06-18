import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  StreamControlCommandResponseFields,
  StreamControlRequestedPayload,
} from "./rpc-schemas"

export class SetStreamControlActionPayload extends Schema.Class<SetStreamControlActionPayload>(
  "SetStreamControlActionPayload",
)({
  action: Schema.String,
  payload: StreamControlRequestedPayload,
}) {}

export class SetStreamControlActionResponse extends Schema.Class<SetStreamControlActionResponse>(
  "SetStreamControlActionResponse",
)(StreamControlCommandResponseFields) {}

export const SetStreamControlActionRpc = Rpc.make(
  "app.stream-control.action.set",
  {
    payload: SetStreamControlActionPayload,
    success: SetStreamControlActionResponse,
    error: ApiError,
  },
)
