import { describe, expect, it } from "bun:test"
import {
  cdpKeyboardEventForBinding,
  resolveBridgeMapping,
  YFS_DEFAULT_MAPPING,
} from "./mapping"

describe("CDP input bridge mapping", () => {
  it("maps the validated YFS buttons and directional inputs", () => {
    const mapping = resolveBridgeMapping("yfs-default")

    expect(mapping.buttons).toMatchObject({
      BTN_DPAD_UP: "arrow-up",
      BTN_DPAD_DOWN: "arrow-down",
      BTN_DPAD_LEFT: "arrow-left",
      BTN_DPAD_RIGHT: "arrow-right",
      BTN_WEST: "key-z",
      BTN_SOUTH: "key-a",
      BTN_EAST: "key-x",
      BTN_NORTH: "key-s",
      BTN_START: "key-p",
    })
    expect(mapping.axes).toEqual([
      expect.objectContaining({ code: "ABS_X", negative: "arrow-left", positive: "arrow-right" }),
      expect.objectContaining({ code: "ABS_Y", negative: "arrow-up", positive: "arrow-down" }),
      expect.objectContaining({ code: "ABS_RX", negative: "arrow-left", positive: "arrow-right" }),
      expect.objectContaining({ code: "ABS_RY", negative: "arrow-up", positive: "arrow-down" }),
    ])
  })

  it("uses Chromium DOM key metadata for each action", () => {
    expect(cdpKeyboardEventForBinding(YFS_DEFAULT_MAPPING, "key-z")).toEqual({
      key: "z",
      code: "KeyZ",
      windowsVirtualKeyCode: 90,
    })
    expect(cdpKeyboardEventForBinding(YFS_DEFAULT_MAPPING, "arrow-left")).toEqual({
      key: "ArrowLeft",
      code: "ArrowLeft",
      windowsVirtualKeyCode: 37,
    })
  })

  it("rejects unknown mapping names", () => {
    expect(() => resolveBridgeMapping("unknown")).toThrow(/Unknown CDP input bridge mapping/)
  })
})
