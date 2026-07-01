import { describe, expect, it } from "bun:test"
import { batchJson } from "@platform/api/rpc/serialization"
import { Effect } from "effect"
import { createDeviceEventsStream } from "./events"
import { DeviceState, makeDeviceStateLayer } from "./device-state"

function battery(percent: number) {
  return {
    percent,
    status: "Discharging",
    supplies: [
      {
        name: "BAT0",
        type: "Battery",
        status: "Discharging",
        capacity: percent,
        online: null,
        voltageNow: null,
        currentNow: null,
        powerNow: null,
        modelName: null,
      },
    ],
  }
}

describe("device-state streaming transport", () => {
  it("keeps batch JSON RPC unary and uses the device SSE bridge for live updates", async () => {
    expect(batchJson.includesFraming).toBe(false)

    const firstEvent = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* DeviceState
          const stream = createDeviceEventsStream(service)
          return yield* Effect.promise(async () => {
            const reader = stream.getReader()
            const first = await reader.read()
            await reader.cancel()
            return new TextDecoder().decode(first.value)
          })
        }).pipe(
          Effect.provide(
            makeDeviceStateLayer({
              startBackground: false,
              readBattery: async () => battery(66),
            }),
          ),
        ),
      ),
    )

    expect(firstEvent).toContain("event: device.state")
    expect(firstEvent).toContain('"percent":66')
  })
})
