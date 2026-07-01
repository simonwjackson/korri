import { ApiError } from "@platform/api/rpc/errors"
import { DeviceStateSchema } from "@platform/device/device-facts"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export class DeviceStatusPayload extends Schema.Class<DeviceStatusPayload>(
  "DeviceStatusPayload",
)({}) {}

export class DeviceStatusResponse extends Schema.Class<DeviceStatusResponse>(
  "DeviceStatusResponse",
)({
  state: DeviceStateSchema,
}) {}

export const DeviceStatusRpc = Rpc.make("app.device.status", {
  payload: DeviceStatusPayload,
  success: DeviceStatusResponse,
  error: ApiError,
})
