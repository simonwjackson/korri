import { RpcClientLive } from "@platform/api/rpc/client"
import { DeviceFactsSource } from "@platform/device/device-facts-source"
import type { DeviceState } from "@platform/device/device-facts"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export const DeviceFactsLayerLive = Layer.effect(DeviceFactsSource)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => ({
      status: () =>
        client["app.device.status"]({}).pipe(
          Effect.map(response => response.state),
        ),
      refresh: () =>
        client["app.device.refresh"]({}).pipe(Effect.asVoid),
      subscribe: (listener: (state: DeviceState) => void) =>
        Effect.gen(function* () {
          if (typeof EventSource === "undefined") {
            const state = yield* client["app.device.status"]({}).pipe(
              Effect.map(response => response.state),
            )
            listener(state)
            return () => undefined
          }
          return yield* Effect.sync(() => {
            const events = new EventSource("/api/device/events")
            const onState = (event: MessageEvent) => {
              const state = parseDeviceEventState(event.data)
              if (state) listener(state)
            }
            events.addEventListener("device.state", onState)
            events.onerror = () => undefined
            return () => {
              events.removeEventListener("device.state", onState)
              events.close()
            }
          })
        }),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

export function parseDeviceEventState(data: string): DeviceState | undefined {
  try {
    const parsed = JSON.parse(data) as { readonly state?: unknown }
    if (!parsed.state || typeof parsed.state !== "object") return undefined
    return parsed.state as DeviceState
  } catch {
    return undefined
  }
}
