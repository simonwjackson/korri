import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  EmptyPayloadFields,
  StreamControlControlsResponseFields,
} from "./rpc-schemas"

export class GetStreamControlControlsPayload extends Schema.Class<GetStreamControlControlsPayload>(
  "GetStreamControlControlsPayload",
)(EmptyPayloadFields) {}

export class GetStreamControlControlsResponse extends Schema.Class<GetStreamControlControlsResponse>(
  "GetStreamControlControlsResponse",
)(StreamControlControlsResponseFields) {}

export const GetStreamControlControlsRpc = Rpc.make(
  "app.stream-control.controls.get",
  {
    payload: GetStreamControlControlsPayload,
    success: GetStreamControlControlsResponse,
    error: ApiError,
  },
)
