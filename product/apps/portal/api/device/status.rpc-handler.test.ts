import { describe, expect, it } from "bun:test"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { serverRpcGroup } from "@product/apps/portal/api/server/rpc-group"
import { Effect } from "effect"
import { makeDeviceStateLayer } from "./device-state"
import { handleDeviceRefresh } from "./refresh.rpc-handler"
import { handleDeviceStatus } from "./status.rpc-handler"

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

describe("app.device RPC handlers", () => {
  it("registers device RPC tags on app and server groups", () => {
    expect(Array.from(appRpcGroup.requests.keys())).toContain(
      "app.device.status",
    )
    expect(Array.from(appRpcGroup.requests.keys())).toContain(
      "app.device.refresh",
    )
    expect(Array.from(serverRpcGroup.requests.keys())).toContain(
      "app.device.status",
    )
    expect(Array.from(serverRpcGroup.requests.keys())).toContain(
      "app.device.refresh",
    )
  })

  it("returns the current device state snapshot", async () => {
    const response = await Effect.runPromise(
      handleDeviceStatus({}).pipe(
        Effect.provide(
          makeDeviceStateLayer({
            startBackground: false,
            readBattery: async () => battery(73),
          }),
        ),
      ),
    )

    expect(response.state.battery).toMatchObject({ _tag: "Ready", percent: 73 })
  })

  it("acknowledges refresh and updates DeviceState", async () => {
    let percent = 20
    const response = await Effect.runPromise(
      Effect.gen(function* () {
        const status = yield* handleDeviceStatus({})
        expect(status.state.battery).toMatchObject({ percent: 20 })
        percent = 21
        return yield* handleDeviceRefresh({})
      }).pipe(
        Effect.provide(
          makeDeviceStateLayer({
            startBackground: false,
            readBattery: async () => battery(percent),
          }),
        ),
      ),
    )

    expect(response).toMatchObject({
      accepted: true,
      fact: "battery",
      state: { battery: { _tag: "Ready", percent: 21 } },
    })
  })
})
