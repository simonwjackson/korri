import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { createDeviceEventsStream } from "./events"
import { DeviceState, makeDeviceStateLayer } from "./device-state"

function battery(percent: number) {
  return {
    percent,
    status: "Charging",
    supplies: [
      {
        name: "BAT0",
        type: "Battery",
        status: "Charging",
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

describe("device event stream", () => {
  it("delivers current device state as the first SSE event", async () => {
    const event = await Effect.runPromise(
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
              readBattery: async () => battery(88),
            }),
          ),
        ),
      ),
    )

    expect(event).toContain("event: device.state")
    expect(event).toContain('"percent":88')
    expect(event).toContain('"charging":true')
  })
})
