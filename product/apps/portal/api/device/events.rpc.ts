import { DeviceStateSchema } from "@platform/device/device-facts"
import { Schema } from "effect"

export const DeviceEvent = Schema.Struct({
  event: Schema.Literal("device.state"),
  state: DeviceStateSchema,
})
export type DeviceEvent = Schema.Schema.Type<typeof DeviceEvent>

export function deviceEventForState(
  state: Schema.Schema.Type<typeof DeviceStateSchema>,
): DeviceEvent {
  return { event: "device.state", state }
}
