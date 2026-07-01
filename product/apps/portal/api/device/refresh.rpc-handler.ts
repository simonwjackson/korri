import { Effect } from "effect"
import { DeviceState } from "./device-state"
import {
  DeviceRefreshResponse,
  type DeviceRefreshPayload,
} from "./refresh.rpc"

export const handleDeviceRefresh = (_payload: typeof DeviceRefreshPayload.Type) =>
  Effect.gen(function* () {
    const service = yield* DeviceState
    const result = yield* service.refresh()
    return new DeviceRefreshResponse(result)
  })
