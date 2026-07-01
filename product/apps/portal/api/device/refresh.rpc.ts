import { ApiError } from "@platform/api/rpc/errors"
import { DeviceStateSchema } from "@platform/device/device-facts"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class DeviceRefreshPayload extends Schema.Class<DeviceRefreshPayload>(
  "DeviceRefreshPayload",
)({
  fact: Schema.optional(Schema.Literal("battery")),
}) {}

export class DeviceRefreshResponse extends Schema.Class<DeviceRefreshResponse>(
  "DeviceRefreshResponse",
)({
  accepted: Schema.Boolean,
  fact: Schema.Literal("battery"),
  state: DeviceStateSchema,
}) {}

export const DeviceRefreshRpc = Rpc.make("app.device.refresh", {
  payload: DeviceRefreshPayload,
  success: DeviceRefreshResponse,
  error: ApiError,
})
