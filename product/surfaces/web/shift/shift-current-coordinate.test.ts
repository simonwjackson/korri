import { afterEach, describe, expect, it } from "bun:test"
import { setShiftCatalogPreview } from "./shift-catalog-preview"
import { shiftCatalogStateSamples } from "./shift-catalog-state-samples"
import { readShiftCurrentCoordinate } from "./shift-current-coordinate"
import {
  launchStateSamples,
  setShiftLaunchPreview,
} from "./shift-launch-preview"

afterEach(() => {
  setShiftCatalogPreview(null)
  setShiftLaunchPreview(null)
})

describe("readShiftCurrentCoordinate", () => {
  it("reports the seed's resting state when nothing is pinned (Live)", () => {
    expect(readShiftCurrentCoordinate("/")).toEqual({
      route: "/",
      data: "Ready",
      launch: "Idle",
    })
  })

  it("captures a pinned Ready + Launching coordinate", () => {
    setShiftCatalogPreview(shiftCatalogStateSamples.Ready())
    setShiftLaunchPreview(launchStateSamples.Launching())

    expect(readShiftCurrentCoordinate("/")).toEqual({
      route: "/",
      data: "Ready",
      launch: "Launching",
    })
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
