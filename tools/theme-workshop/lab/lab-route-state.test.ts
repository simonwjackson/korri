import { describe, expect, it } from "bun:test"
import {
  deviceSegmentForSelection,
  normalizeSurfacePath,
  parseDeviceSegment,
  selectedDevicesForSegment,
} from "./lab-route-state"

const knownDevices = ["rg353m", "thor", "odin2portal", "tv65"] as const

describe("lab route state", () => {
  it("treats all as the full device set", () => {
    expect(parseDeviceSegment("all", knownDevices)).toEqual({ kind: "all" })
    expect(selectedDevicesForSegment("all", knownDevices)).toEqual(knownDevices)
    expect(deviceSegmentForSelection({ kind: "all" }, knownDevices)).toBe("all")
  })

  it("round-trips a comma-separated selected device set", () => {
    const parsed = parseDeviceSegment("rg353m,odin2portal", knownDevices)

    expect(parsed).toEqual({ kind: "set", ids: ["rg353m", "odin2portal"] })
    expect(selectedDevicesForSegment("rg353m,odin2portal", knownDevices)).toEqual([
      "rg353m",
      "odin2portal",
    ])
    expect(deviceSegmentForSelection(parsed, knownDevices)).toBe(
      "rg353m,odin2portal",
    )
  })

  it("normalizes empty, duplicate, and unknown device ids to a valid set", () => {
    expect(parseDeviceSegment("", knownDevices)).toEqual({ kind: "all" })
    expect(parseDeviceSegment("unknown,rg353m,rg353m", knownDevices)).toEqual({
      kind: "set",
      ids: ["rg353m"],
    })
    expect(parseDeviceSegment("unknown", knownDevices)).toEqual({ kind: "all" })
  })

  it("normalizes surface splats to app paths", () => {
    expect(normalizeSurfacePath(undefined)).toBe("/")
    expect(normalizeSurfacePath("")).toBe("/")
    expect(normalizeSurfacePath("/")).toBe("/")
    expect(normalizeSurfacePath("game/hollow-knight")).toBe(
      "/game/hollow-knight",
    )
    expect(normalizeSurfacePath("/game/hollow-knight")).toBe(
      "/game/hollow-knight",
    )
  })
})
