import { describe, expect, it } from "bun:test"
import {
  clusterBoundingHeightPx,
  deviceScreens,
  groupScreensByPlacement,
} from "./device-screens"
import type { DeviceConfig, ScreenConfig } from "./types"

describe("deviceScreens", () => {
  it("yields one primary screen for a single-screen device", () => {
    const device: DeviceConfig = {
      id: "rg353m",
      name: "RG353M",
      widthMm: 72,
      heightMm: 52,
    }
    expect(deviceScreens(device)).toEqual([
      { id: "rg353m", widthMm: 72, heightMm: 52, role: "primary" },
    ])
  })

  it("returns the declared screens for a multi-screen device", () => {
    const screens: readonly ScreenConfig[] = [
      { id: "top", widthMm: 132, heightMm: 76, role: "primary" },
      { id: "bottom", widthMm: 110, heightMm: 62, role: "secondary" },
    ]
    const device: DeviceConfig = {
      id: "thor",
      name: "THOR",
      widthMm: 132,
      heightMm: 76,
      screens,
    }
    expect(deviceScreens(device)).toBe(screens)
  })
})

describe("groupScreensByPlacement", () => {
  const make = (
    id: string,
    extra: Partial<ScreenConfig> = {},
  ): ScreenConfig => ({
    id,
    widthMm: 100,
    heightMm: 100,
    ...extra,
  })

  it("buckets each secondary onto its placement side", () => {
    const primary = make("p", { role: "primary" })
    const screens = [
      primary,
      make("a", { role: "secondary", placement: "above" }),
      make("b", { role: "secondary", placement: "below" }),
      make("l", { role: "secondary", placement: "left" }),
      make("r", { role: "secondary", placement: "right" }),
    ]
    const placed = groupScreensByPlacement(screens)
    expect(placed.primary).toBe(primary)
    expect(placed.above.map(s => s.id)).toEqual(["a"])
    expect(placed.below.map(s => s.id)).toEqual(["b"])
    expect(placed.left.map(s => s.id)).toEqual(["l"])
    expect(placed.right.map(s => s.id)).toEqual(["r"])
  })

  it("defaults a secondary with no placement to below", () => {
    const screens = [
      make("p", { role: "primary" }),
      make("b", { role: "secondary" }),
    ]
    expect(groupScreensByPlacement(screens).below.map(s => s.id)).toEqual(["b"])
  })
})

describe("clusterBoundingHeightPx", () => {
  it("adds a below screen's height to the primary's", () => {
    const screens: readonly ScreenConfig[] = [
      { id: "p", widthMm: 100, heightMm: 100, bezel: false, role: "primary" },
      {
        id: "b",
        widthMm: 100,
        heightMm: 50,
        bezel: false,
        role: "secondary",
        placement: "below",
      },
    ]
    // primary 100 + (below 50 + one 10px gap) = 160
    expect(clusterBoundingHeightPx(screens, 1, 10)).toBe(160)
  })

  it("does not add a side screen's height, only the taller of the row", () => {
    const screens: readonly ScreenConfig[] = [
      { id: "p", widthMm: 100, heightMm: 100, bezel: false, role: "primary" },
      {
        id: "r",
        widthMm: 60,
        heightMm: 50,
        bezel: false,
        role: "secondary",
        placement: "right",
      },
    ]
    // right is beside, not below: height stays max(100, 50) = 100
    expect(clusterBoundingHeightPx(screens, 1, 10)).toBe(100)
  })
})
