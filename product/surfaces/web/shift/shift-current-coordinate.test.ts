import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { setShiftCatalogPreview } from "./shift-catalog-preview"
import { shiftCatalogStateSamples } from "./shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "./shift-current-coordinate"
import {
  foregroundStateSamples,
  setShiftForegroundPreview,
} from "./shift-foreground-preview"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "./shift-launch-preview"
import {
  setShiftLiveData,
  setShiftLiveForeground,
  setShiftLiveLaunch,
} from "./shift-live-coordinate"

function resetCoordinateSeams() {
  setShiftCatalogPreview(null)
  setShiftLaunchPreview(null)
  setShiftForegroundPreview(null)
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

  it("captures a live launch state the route published (no pin)", () => {
    setShiftLiveLaunch("Launching")
    expect(readShiftCurrentCoordinate("/").launch).toBe("Launching")
  })

  it("prefers the launch pin over the live store", () => {
    setShiftLiveLaunch("Launching")
    setShiftLaunchPreview(launchStateSamples.Failed())
    expect(readShiftCurrentCoordinate("/").launch).toBe("Failed")
  })

  it("captures a pinned Ready + Launching coordinate", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
    setShiftLaunchPreview(launchStateSamples.Launching())

    expect(readShiftCurrentCoordinate("/")).toEqual({
      route: "/",
      data: "Ready",
      launch: "Launching",
      foreground: "Ready",
    })
  })

  it("captures a live foreground gate state the route published (no pin)", () => {
    setShiftLiveForeground("Cooling")
    expect(readShiftCurrentCoordinate("/").foreground).toBe("Cooling")
  })

  it("prefers the foreground pin over the live store", () => {
    setShiftLiveForeground("Cooling")
    setShiftForegroundPreview(foregroundStateSamples.Recovering())
    expect(readShiftCurrentCoordinate("/").foreground).toBe("Recovering")
  })

  it("captures the pinned data tag for a non-Ready state", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Empty())
    expect(readShiftCurrentCoordinate("/").data).toBe("Empty")
  })

  it("carries the supplied route through unchanged", () => {
    expect(readShiftCurrentCoordinate("/game/hollow-knight").route).toBe(
      "/game/hollow-knight",
    )
  })
})
