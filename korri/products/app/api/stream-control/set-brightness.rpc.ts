import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeBrightnessPercent,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetBrightnessPayload extends Schema.Class<SetBrightnessPayload>(
  "SetBrightnessPayload",
)({
  percent: RuntimeBrightnessPercent,
  device: Schema.optional(Schema.String),
}) {}

export class SetBrightnessResponse extends Schema.Class<SetBrightnessResponse>(
  "SetBrightnessResponse",
)(StreamControlCommandResponseFields) {}

export const SetBrightnessRpc = Rpc.make("app.stream-control.brightness.set", {
  payload: SetBrightnessPayload,
  success: SetBrightnessResponse,
  error: ApiError,
})
