import { afterEach, describe, expect, it } from "bun:test"
import { RegistryProvider, useAtomValue } from "@effect/atom-react"
import {
  deviceStateFromFacts,
  unknownDeviceState,
} from "@platform/device/device-facts"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import type { KorriPlatformBridge } from "@platform/surface/bridge"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftDeviceBridge } from "./ShiftDeviceBridge"

afterEach(cleanup)

function DeviceProbe() {
  const state = useAtomValue(deviceStateAtom)
  return <output>{state.network._tag}</output>
}

function deviceWithState(
  state = deviceStateFromFacts({
    observedAt: "2026-07-05T00:00:00.000Z",
    battery: {
      _tag: "Ready",
      percent: 82,
      status: "Discharging",
      charging: false,
      supplies: [],
      observedAt: "2026-07-05T00:00:00.000Z",
    },
    network: {
      _tag: "Connected",
      kind: "wifi",
      strengthPercent: 76,
      observedAt: "2026-07-05T00:00:00.000Z",
    },
  }),
): KorriPlatformBridge["device"] {
  return {
    status: async () => state,
    refresh: async () => undefined,
    subscribe(listener) {
      listener(state)
      return () => undefined
    },
  }
}

describe("ShiftDeviceBridge", () => {
  it("presents bridge device state through deviceStateAtom", () => {
    render(
      <RegistryProvider>
        <ShiftDeviceBridge device={deviceWithState()} />
        <DeviceProbe />
      </RegistryProvider>,
    )

    expect(screen.getByRole("status").textContent).toBe("Connected")
  })

  it("does nothing when no device bridge is present", () => {
    render(
      <RegistryProvider>
        <ShiftDeviceBridge />
        <DeviceProbe />
      </RegistryProvider>,
    )

    expect(screen.getByRole("status").textContent).toBe(
      unknownDeviceState().network._tag,
    )
  })

  it("unsubscribes on unmount", () => {
    let unsubscribed = false
    const device: KorriPlatformBridge["device"] = {
      status: async () => unknownDeviceState(),
      refresh: async () => undefined,
      subscribe() {
        return () => {
          unsubscribed = true
        }
      },
    }

    const rendered = render(
      <RegistryProvider>
        <ShiftDeviceBridge device={device} />
      </RegistryProvider>,
    )

    rendered.unmount()

    expect(unsubscribed).toBe(true)
  })
})
