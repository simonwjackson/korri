import { ApiError } from "@platform/api/rpc/errors"
import { DeviceStateSchema } from "@platform/device/device-facts"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export const DeviceRefreshFact = Schema.Union([
  Schema.Literal("battery"),
  Schema.Literal("network"),
])

export class DeviceRefreshPayload extends Schema.Class<DeviceRefreshPayload>(
  "DeviceRefreshPayload",
)({
  fact: Schema.optional(DeviceRefreshFact),
}) {}

export class DeviceRefreshResponse extends Schema.Class<DeviceRefreshResponse>(
  "DeviceRefreshResponse",
)({
  accepted: Schema.Boolean,
  facts: Schema.Array(DeviceRefreshFact),
  state: DeviceStateSchema,
}) {}

export const DeviceRefreshRpc = Rpc.make("app.device.refresh", {
  payload: DeviceRefreshPayload,
  success: DeviceRefreshResponse,
  error: ApiError,
})
