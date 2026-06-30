import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { DEFAULT_SHIFT_CLOCK_ISO } from "./shift-clock-state"
import { readShiftCurrentCoordinate } from "./shift-current-coordinate"
import {
  setShiftLiveClock,
  setShiftLiveData,
  setShiftLiveForeground,
  setShiftLiveLaunch,
  setShiftLiveNetwork,
  setShiftLivePower,
} from "./shift-live-coordinate"
import { DEFAULT_SHIFT_NETWORK_STATUS } from "./shift-network-state"
import { DEFAULT_SHIFT_POWER_STATE } from "./shift-power-state"

function resetCoordinateSeams() {
  // Reset the live-coordinate store to the seed resting state between tests.
  setShiftLiveData("Ready")
  setShiftLiveLaunch("Idle")
  setShiftLiveForeground("Ready")
  setShiftLivePower(DEFAULT_SHIFT_POWER_STATE)
  setShiftLiveClock(DEFAULT_SHIFT_CLOCK_ISO)
  setShiftLiveNetwork(DEFAULT_SHIFT_NETWORK_STATUS)
}

beforeEach(resetCoordinateSeams)
afterEach(resetCoordinateSeams)

describe("readShiftCurrentCoordinate", () => {
  it("reports the seed's resting state when nothing is pinned (Live)", () => {
    expect(readShiftCurrentCoordinate("/")).toEqual({
      route: "/",
      data: "Ready",
      launch: "Idle",
      foreground: "Ready",
      power: "Medium",
      clock: "2026-06-30T16:24:00.000Z",
      network: "Connected",
    })
  })

  it("captures a live launch state the route published", () => {
    setShiftLiveLaunch("Launching")
    expect(readShiftCurrentCoordinate("/").launch).toBe("Launching")
  })

  it("captures a live Ready + Launching coordinate", () => {
    setShiftLiveData("Ready")
    setShiftLiveLaunch("Launching")

    expect(readShiftCurrentCoordinate("/")).toEqual({
      route: "/",
      data: "Ready",
      launch: "Launching",
      foreground: "Ready",
      power: "Medium",
      clock: "2026-06-30T16:24:00.000Z",
      network: "Connected",
    })
  })

  it("captures a live foreground gate state the route published", () => {
    setShiftLiveForeground("Cooling")
    expect(readShiftCurrentCoordinate("/").foreground).toBe("Cooling")
  })

  it("captures the live power state the route published", () => {
    setShiftLivePower("Charging")
    expect(readShiftCurrentCoordinate("/").power).toBe("Charging")
  })

  it("captures the live clock value the route published", () => {
    setShiftLiveClock("2026-06-30T23:08:00.000Z")
    expect(readShiftCurrentCoordinate("/").clock).toBe(
      "2026-06-30T23:08:00.000Z",
    )
  })

  it("captures the live network status the route published", () => {
    setShiftLiveNetwork("Disconnected")
    expect(readShiftCurrentCoordinate("/").network).toBe("Disconnected")
  })

  it("captures the live data tag for a non-Ready state", () => {
    setShiftLiveData("Empty")
    expect(readShiftCurrentCoordinate("/").data).toBe("Empty")
  })

  it("carries the supplied route through unchanged", () => {
    expect(readShiftCurrentCoordinate("/game/hollow-knight").route).toBe(
      "/game/hollow-knight",
    )
  })
})
