import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  decodeNativeInputEvent,
  decodeNativeInputSubscription,
  NativeInputAction,
  NativeInputDeviceAdded,
  NativeInputDeviceClass,
  NativeInputDeviceInfo,
  NativeInputDeviceRemoved,
  NativeInputEvent,
  type NativeInputEvent as NativeInputEventType,
  NativeInputInput,
  NativeInputSubscription,
} from "./wire-schema"

function assertExhaustive(event: NativeInputEventType): string {
  switch (event.kind) {
    case "input":
      return `${event.deviceId}:${event.type}:${event.code}:${event.value}`
    case "device-added":
      return event.device.deviceId
    case "device-removed":
      return event.deviceId
    case "action":
      return `${event.class}:${event.action}`
    default: {
      const neverEvent: never = event
      return neverEvent
    }
  }
}

describe("native input wire schema", () => {
  it("round-trips an input event", () => {
    const input = {
      kind: "input",
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      type: 1,
      code: 304,
      value: 1,
      timestamp: 1710000000123,
    } as const

    const decoded = decodeNativeInputEvent(input)
    const encoded = Schema.encodeSync(NativeInputEvent)(decoded)

    expect(decoded).toEqual(input)
    expect(encoded).toEqual(input)
  })

  it("round-trips a device-added event", () => {
    const input = {
      kind: "device-added",
      device: {
        deviceId: "inputplumber-virtual-xbox360",
        class: "gamepad",
        name: "InputPlumber Virtual Xbox 360 Controller",
        capabilities: ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"],
      },
    } as const

    const decoded = decodeNativeInputEvent(input)
    const encoded = Schema.encodeSync(NativeInputEvent)(decoded)

    expect(decoded).toEqual(input)
    expect(encoded).toEqual(input)
  })

  it("round-trips gamepad axis metadata on device-added events", () => {
    const input = {
      kind: "device-added",
      device: {
        deviceId: "inputplumber-virtual-xbox360",
        class: "gamepad",
        name: "InputPlumber Virtual Xbox 360 Controller",
        capabilities: ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"],
        axes: [{ code: 0, minimum: -1_408, maximum: 1_408, flat: 0 }],
      },
    } as const

    const decoded = decodeNativeInputEvent(input)
    const encoded = Schema.encodeSync(NativeInputEvent)(decoded)

    expect(decoded).toEqual(input)
    expect(encoded).toEqual(input)
  })

  it("round-trips a native action event", () => {
    const input = {
      kind: "action",
      class: "system",
      action: "system",
      timestamp: 1710000000123,
    } as const

    const decoded = decodeNativeInputEvent(input)
    const encoded = Schema.encodeSync(NativeInputEvent)(decoded)

    expect(decoded).toEqual(input)
    expect(encoded).toEqual(input)
  })

  it("round-trips a device-removed event", () => {
    const input = {
      kind: "device-removed",
      deviceId: "inputplumber-virtual-xbox360",
    } as const

    const decoded = decodeNativeInputEvent(input)
    const encoded = Schema.encodeSync(NativeInputEvent)(decoded)

    expect(decoded).toEqual(input)
    expect(encoded).toEqual(input)
  })

  it("decodes subscription frames", () => {
    const decoded = decodeNativeInputSubscription({
      classes: ["gamepad", "keyboard"],
    })

    expect(decoded.classes).toEqual(["gamepad", "keyboard"])
  })

  it("rejects unknown event kinds", () => {
    expect(() =>
      decodeNativeInputEvent({
        kind: "lava-lamp",
        deviceId: "x",
      }),
    ).toThrow()
  })

  it("rejects unknown device classes", () => {
    expect(() =>
      decodeNativeInputEvent({
        kind: "input",
        deviceId: "x",
        class: "lava-lamp",
        type: 1,
        code: 304,
        value: 1,
        timestamp: 1,
      }),
    ).toThrow()
  })

  it("rejects non-numeric input values", () => {
    expect(() =>
      decodeNativeInputEvent({
        kind: "input",
        deviceId: "x",
        class: "gamepad",
        type: 1,
        code: 304,
        value: "pressed",
        timestamp: 1,
      }),
    ).toThrow()
  })

  it("round-trips a mixed event batch", () => {
    const input = Array.from({ length: 100 }, (_, index) => {
      if (index % 3 === 0) {
        return {
          kind: "device-added",
          device: {
            deviceId: `device-${index}`,
            class: "gamepad",
            name: `Controller ${index}`,
            capabilities: ["EV_KEY"],
          },
        } as const
      }
      if (index % 3 === 1) {
        return {
          kind: "input",
          deviceId: `device-${index - 1}`,
          class: "gamepad",
          type: 1,
          code: 304,
          value: index,
          timestamp: 1710000000000 + index,
        } as const
      }
      return {
        kind: "device-removed",
        deviceId: `device-${index - 2}`,
      } as const
    })

    const decoded = Schema.decodeUnknownSync(Schema.Array(NativeInputEvent))(
      input,
    )
    const encoded = Schema.encodeSync(Schema.Array(NativeInputEvent))(decoded)

    expect(encoded).toEqual(input)
  })

  it("is exhaustively narrowable by kind", () => {
    expect(
      assertExhaustive(
        new NativeInputInput({
          kind: "input",
          deviceId: "x",
          class: "gamepad",
          type: 1,
          code: 304,
          value: 1,
          timestamp: 1,
        }),
      ),
    ).toBe("x:1:304:1")
  })

  it("exports the individual schemas for downstream bridge code", () => {
    expect(NativeInputDeviceClass).toBeDefined()
    expect(NativeInputDeviceInfo).toBeDefined()
    expect(NativeInputInput).toBeDefined()
    expect(NativeInputDeviceAdded).toBeDefined()
    expect(NativeInputDeviceRemoved).toBeDefined()
    expect(NativeInputAction).toBeDefined()
    expect(NativeInputSubscription).toBeDefined()
  })
})
