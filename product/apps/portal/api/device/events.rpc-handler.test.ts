import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { DeviceState, makeDeviceStateLayer } from "./device-state"
import { createDeviceEventsStream } from "./events"

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

function connectedWifi() {
  return {
    connected: true,
    kind: "wifi" as const,
    strengthPercent: 66,
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
              readNetwork: async () => connectedWifi(),
            }),
          ),
        ),
      ),
    )

    expect(event).toContain("event: device.state")
    expect(event).toContain('"percent":88')
    expect(event).toContain('"charging":true')
    expect(event).toContain('"network"')
    expect(event).toContain('"strengthPercent":66')
  })
})
