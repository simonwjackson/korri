import { describe, expect, it } from "bun:test"
import { clusterOuterHeightPx, deviceScreens } from "./device-screens"
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

describe("clusterOuterHeightPx", () => {
  it("sums screen heights with gaps when bezels are disabled", () => {
    const screens: readonly ScreenConfig[] = [
      { id: "a", widthMm: 100, heightMm: 100, bezel: false },
      { id: "b", widthMm: 100, heightMm: 50, bezel: false },
    ]
    // 100*2 + 50*2 + one 10px gap = 310
    expect(clusterOuterHeightPx(screens, 2, 10)).toBe(310)
  })

  it("adds bezel padding when bezel is not disabled", () => {
    const screens: readonly ScreenConfig[] = [
      { id: "a", widthMm: 100, heightMm: 100 },
    ]
    // heightPx 100, pad round(100*0.037)=4, outer 100 + 4*2 = 108
    expect(clusterOuterHeightPx(screens, 1)).toBe(108)
  })
})
