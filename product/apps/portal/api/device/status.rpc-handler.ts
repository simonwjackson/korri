import { Effect } from "effect"
import { DeviceState } from "./device-state"
import {
  DeviceStatusResponse,
  type DeviceStatusPayload,
} from "./status.rpc"

export const handleDeviceStatus = (_payload: typeof DeviceStatusPayload.Type) =>
  Effect.gen(function* () {
    const service = yield* DeviceState
    const state = yield* service.current()
    return new DeviceStatusResponse({ state })
  })
