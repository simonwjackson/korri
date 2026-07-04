import { afterEach, describe, expect, it } from "bun:test"
import type { DeviceConfig } from "../../device-lab"
import {
  clampFrameWidth,
  deviceAspect,
  deviceFaceLabel,
  devicePresetWidth,
  getPreviewFrame,
  LAB_FRAME_MAX_WIDTH,
  LAB_FRAME_MIN_WIDTH,
  resetPreviewFrameForTest,
  setPreviewFrame,
} from "./lab-preview-frame"

afterEach(() => resetPreviewFrameForTest())

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
    expect(clampFrameWidth(9999)).toBe(LAB_FRAME_MAX_WIDTH)
    expect(clampFrameWidth(521.6)).toBe(522)
  })

  it("falls back to the default on a non-finite width", () => {
    expect(clampFrameWidth(Number.NaN)).toBe(520)
  })
})

describe("setPreviewFrame", () => {
  it("merges a partial patch and clamps the width", () => {
    setPreviewFrame({ deviceId: "thor" })
    expect(getPreviewFrame()).toEqual({ deviceId: "thor", width: 520 })

    setPreviewFrame({ width: 5 })
    expect(getPreviewFrame()).toEqual({
      deviceId: "thor",
      width: LAB_FRAME_MIN_WIDTH,
    })

    setPreviewFrame({ deviceId: null })
    expect(getPreviewFrame().deviceId).toBeNull()
  })
})

describe("device helpers", () => {
  it("derives aspect from the primary face, ignoring a secondary screen", () => {
    expect(deviceAspect(handheld)).toBeCloseTo(72 / 52)
    // THOR's aspect comes from its top (primary) panel, not the companion.
    expect(deviceAspect(dualScreen)).toBeCloseTo(132 / 76)
  })

  it("normalises preset width on a common height so shapes differ", () => {
    expect(devicePresetWidth(handheld)).toBe(clampFrameWidth(380 * (72 / 52)))
    expect(devicePresetWidth(dualScreen)).toBeGreaterThan(
      devicePresetWidth(handheld),
    )
  })

  it("labels the primary face in millimetres", () => {
    expect(deviceFaceLabel(handheld)).toBe("72×52mm")
    expect(deviceFaceLabel(dualScreen)).toBe("132×76mm")
  })
})
