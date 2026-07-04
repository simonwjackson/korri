import { describe, expect, it } from "bun:test"
import type { DeviceConfig } from "../../device-lab"
import {
  clampFrameWidth,
  deviceAspect,
  deviceFaceLabel,
  framePhysicalSize,
  LAB_FRAME_MAX_WIDTH,
  LAB_FRAME_MIN_WIDTH,
} from "./lab-preview-frame"

const handheld: DeviceConfig = {
  id: "rg353m",
  name: "RG353M",
  widthMm: 72,
  heightMm: 52,
}

const dualScreen: DeviceConfig = {
  id: "thor",
  name: "THOR",
  widthMm: 132,
  heightMm: 76,
  screens: [
    { id: "top", widthMm: 132, heightMm: 76, role: "primary" },
    { id: "bottom", widthMm: 75, heightMm: 65, role: "secondary" },
  ],
}

describe("clampFrameWidth", () => {
  it("clamps to the min/max range and rounds", () => {
    expect(clampFrameWidth(10)).toBe(LAB_FRAME_MIN_WIDTH)
    expect(clampFrameWidth(99999)).toBe(LAB_FRAME_MAX_WIDTH)
    expect(clampFrameWidth(521.6)).toBe(522)
  })

  it("falls back to the min on a non-finite width", () => {
    expect(clampFrameWidth(Number.NaN)).toBe(LAB_FRAME_MIN_WIDTH)
  })
})

describe("device helpers", () => {
  it("derives aspect from the primary face, ignoring a secondary screen", () => {
    expect(deviceAspect(handheld)).toBeCloseTo(72 / 52)
    // THOR's aspect comes from its top (primary) panel, not the companion.
    expect(deviceAspect(dualScreen)).toBeCloseTo(132 / 76)
  })

  it("sizes the frame physically so a bigger device is a bigger frame", () => {
    const tv: DeviceConfig = {
      id: "tv65",
      name: '65" TV',
      widthMm: 1439,
      heightMm: 809,
    }
    const logical = { widthMm: 156, heightMm: 85 }

    const small = framePhysicalSize({ device: handheld, logical, pxPerMm: 2 })
    expect(small).toEqual({ width: 144, height: 104 })

    const big = framePhysicalSize({ device: tv, logical, pxPerMm: 2 })
    // A TV is physically much larger — width AND height dwarf the handheld,
    // not merely a wider aspect at the same height.
    expect(big.width).toBeGreaterThan(small.width * 5)
    expect(big.height).toBeGreaterThan(small.height * 5)
  })

  it("lets a custom width AND height win verbatim (free rectangle resize)", () => {
    const logical = { widthMm: 100, heightMm: 100 }
    const sized = framePhysicalSize({
      device: handheld,
      logical,
      pxPerMm: 2,
      customWidth: 400,
      customHeight: 250,
    })
    // No aspect constraint: both dimensions are honoured as dragged.
    expect(sized).toEqual({ width: 400, height: 250 })
  })

  it("ignores a custom width without a height and stays physical", () => {
    const sized = framePhysicalSize({
      device: handheld,
      logical: { widthMm: 100, heightMm: 100 },
      pxPerMm: 2,
      customWidth: 400,
    })
    expect(sized).toEqual({ width: 144, height: 104 })
  })

  it("fits the part's own logical screen when no device is chosen", () => {
    const sized = framePhysicalSize({
      device: null,
      logical: { widthMm: 100, heightMm: 100 },
      pxPerMm: 3,
    })
    expect(sized).toEqual({ width: 300, height: 300 })
  })

  it("labels the primary face in millimetres", () => {
    expect(deviceFaceLabel(handheld)).toBe("72×52mm")
    expect(deviceFaceLabel(dualScreen)).toBe("132×76mm")
  })
})
