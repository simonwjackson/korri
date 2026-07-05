import { describe, expect, it } from "bun:test"
import { deviceStateFromFacts } from "@platform/device/device-facts"
import {
  shiftDeviceNetworkStateForNetworkReading,
  shiftNetworkDisplayLabel,
  shiftNetworkReadingForDeviceState,
  shiftNetworkReadingForValue,
} from "./shift-network-state"

function state(network: Parameters<typeof deviceStateFromFacts>[0]["network"]) {
  return deviceStateFromFacts({
    observedAt: "2026-07-05T00:00:00.000Z",
    battery: { _tag: "Unknown", observedAt: "2026-07-05T00:00:00.000Z" },
    network,
  })
}

describe("shift network state", () => {
  it("maps connected device facts to a connected Shift reading", () => {
    expect(
      shiftNetworkReadingForDeviceState(
        state({
          _tag: "Connected",
          kind: "wifi",
          strengthPercent: 76,
          observedAt: "now",
        }),
      ),
    ).toEqual({ _tag: "Connected", strengthPercent: 76 })
  })

  it("maps disconnected device facts to a disconnected Shift reading", () => {
    expect(
      shiftNetworkReadingForDeviceState(
        state({ _tag: "Disconnected", observedAt: "now" }),
      ),
    ).toEqual({ _tag: "Disconnected" })
  })

  it("does not turn unknown or stale device facts into fake connected defaults", () => {
    expect(
      shiftNetworkReadingForDeviceState(
        state({ _tag: "Unknown", observedAt: "now" }),
      ),
    ).toEqual({ _tag: "Unknown" })
    expect(
      shiftNetworkReadingForDeviceState(
        state({
          _tag: "Stale",
          message: "busy",
          observedAt: "later",
          lastKnown: {
            _tag: "Connected",
            kind: "wifi",
            strengthPercent: 88,
            observedAt: "earlier",
          },
        }),
      ),
    ).toEqual({ _tag: "Unknown" })
  })

  it("keeps null strength as connected without fake precision", () => {
    expect(
      shiftNetworkDisplayLabel({ _tag: "Connected", strengthPercent: null }),
    ).toBe("Connected")
  })

  it("parses unknown network readings from lab values", () => {
    expect(shiftNetworkReadingForValue({ _tag: "Unknown" })).toEqual({
      _tag: "Unknown",
    })
  })

  it("maps lab network readings into device network facts", () => {
    expect(
      shiftDeviceNetworkStateForNetworkReading(
        { _tag: "Connected", strengthPercent: 44 },
        "now",
      ),
    ).toEqual({
      _tag: "Connected",
      kind: "wifi",
      strengthPercent: 44,
      observedAt: "now",
    })
    expect(
      shiftDeviceNetworkStateForNetworkReading({ _tag: "Disconnected" }, "now"),
    ).toEqual({ _tag: "Disconnected", observedAt: "now" })
  })
})
