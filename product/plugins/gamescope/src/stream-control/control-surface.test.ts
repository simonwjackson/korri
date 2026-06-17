import { describe, expect, it } from "bun:test"
import {
  GAMESCOPE_FPS_STEPS,
  GAMESCOPE_SCALING_FILTERS,
} from "./control-surface"

describe("gamescope stream-control surface", () => {
  it("exposes the product Gamescope FPS ladder and runtime filters", () => {
    expect(GAMESCOPE_FPS_STEPS).toEqual([
      0, 30, 45, 60, 75, 90, 120, 144, 165, 240,
    ])
    expect(GAMESCOPE_SCALING_FILTERS).toEqual([
      "linear",
      "nearest",
      "integer",
      "fsr",
      "nis",
    ])
  })
})
