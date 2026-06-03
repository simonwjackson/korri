import { ApiError } from "@shared/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import { RuntimeFps, StreamControlCommandResponseFields } from "./rpc-schemas"

// Linked FPS is constrained by Moonlight's stream FPS contract. Gamescope's
// standalone limiter accepts 0 as "off", but linked mode must keep both sides
// on a real stream frame rate.
export class SetLinkedFpsPayload extends Schema.Class<SetLinkedFpsPayload>(
  "SetLinkedFpsPayload",
)({ fps: RuntimeFps }) {}

export class SetLinkedFpsResponse extends Schema.Class<SetLinkedFpsResponse>(
  "SetLinkedFpsResponse",
)(StreamControlCommandResponseFields) {}

export const SetLinkedFpsRpc = Rpc.make("app.stream-control.linked-fps.set", {
  payload: SetLinkedFpsPayload,
  success: SetLinkedFpsResponse,
  error: ApiError,
})
