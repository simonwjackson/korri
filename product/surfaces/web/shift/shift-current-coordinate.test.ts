import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { readShiftCurrentCoordinate } from "./shift-current-coordinate"
import {
  setShiftLiveData,
  setShiftLiveForeground,
  setShiftLiveLaunch,
} from "./shift-live-coordinate"

function resetCoordinateSeams() {
  // Reset the live-coordinate store to the seed resting state between tests.
  setShiftLiveData("Ready")
  setShiftLiveLaunch("Idle")
  setShiftLiveForeground("Ready")
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
    })
  })

  it("captures a live foreground gate state the route published", () => {
    setShiftLiveForeground("Cooling")
    expect(readShiftCurrentCoordinate("/").foreground).toBe("Cooling")
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
