import { Context, Effect, Layer } from "effect"
import { unknownDeviceState, type DeviceState } from "./device-facts"

export interface DeviceFactsSourceService {
  readonly status: () => Effect.Effect<DeviceState, unknown>
  readonly refresh: () => Effect.Effect<void, unknown>
  readonly subscribe: (
    listener: (state: DeviceState) => void,
  ) => Effect.Effect<() => void, unknown>
}

export class DeviceFactsSource extends Context.Service<
  DeviceFactsSource,
  DeviceFactsSourceService
>()("DeviceFactsSource") {}

export function makeStaticDeviceFactsSourceLayer(
  state: DeviceState = unknownDeviceState(),
): Layer.Layer<DeviceFactsSource> {
  return Layer.succeed(DeviceFactsSource)({
    status: () => Effect.succeed(state),
    refresh: () => Effect.void,
    subscribe: listener =>
      Effect.sync(() => {
        listener(state)
        return () => undefined
      }),
  })
}
