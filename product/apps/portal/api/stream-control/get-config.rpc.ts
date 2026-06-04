import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  EmptyPayloadFields,
  StreamControlConfigResponseFields,
} from "./rpc-schemas"

export class GetStreamControlConfigPayload extends Schema.Class<GetStreamControlConfigPayload>(
  "GetStreamControlConfigPayload",
)(EmptyPayloadFields) {}

export class GetStreamControlConfigResponse extends Schema.Class<GetStreamControlConfigResponse>(
  "GetStreamControlConfigResponse",
)(StreamControlConfigResponseFields) {}

export const GetStreamControlConfigRpc = Rpc.make(
  "app.stream-control.config.get",
  {
    payload: GetStreamControlConfigPayload,
    success: GetStreamControlConfigResponse,
    error: ApiError,
  },
)
