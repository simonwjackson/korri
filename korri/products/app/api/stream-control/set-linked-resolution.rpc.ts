import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import {
  RuntimeGamescopeResolutionDimension,
  StreamControlCommandResponseFields,
} from "./rpc-schemas"

export class SetLinkedResolutionPayload extends Schema.Class<SetLinkedResolutionPayload>(
  "SetLinkedResolutionPayload",
)({
  width: RuntimeGamescopeResolutionDimension,
  height: RuntimeGamescopeResolutionDimension,
}) {}

export class SetLinkedResolutionResponse extends Schema.Class<SetLinkedResolutionResponse>(
  "SetLinkedResolutionResponse",
)(StreamControlCommandResponseFields) {}

export const SetLinkedResolutionRpc = Rpc.make(
  "app.stream-control.linked-resolution.set",
  {
    payload: SetLinkedResolutionPayload,
    success: SetLinkedResolutionResponse,
    error: ApiError,
  },
)
