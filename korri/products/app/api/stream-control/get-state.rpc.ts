import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  EmptyPayloadFields,
  StreamControlStateResponseFields,
} from "./rpc-schemas"

export class GetStreamControlStatePayload extends Schema.Class<GetStreamControlStatePayload>(
  "GetStreamControlStatePayload",
)(EmptyPayloadFields) {}

export class GetStreamControlStateResponse extends Schema.Class<GetStreamControlStateResponse>(
  "GetStreamControlStateResponse",
)(StreamControlStateResponseFields) {}

export const GetStreamControlStateRpc = Rpc.make(
  "app.stream-control.state.get",
  {
    payload: GetStreamControlStatePayload,
    success: GetStreamControlStateResponse,
    error: ApiError,
  },
)
