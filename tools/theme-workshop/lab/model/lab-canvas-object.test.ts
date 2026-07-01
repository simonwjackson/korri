import { beforeEach, describe, expect, it } from "bun:test"
import {
  createLiveDeviceObject,
  createPlacedPartObject,
  isLiveDeviceObject,
  isPlacedPartObject,
  type LabCanvasObject,
  moveCanvasObject,
  objectBounds,
  removeCanvasObject,
  resetCanvasObjectIdCounterForTest,
  updateLiveDeviceObjectSize,
} from "./lab-canvas-object"

describe("lab canvas objects", () => {
  beforeEach(() => resetCanvasObjectIdCounterForTest())

  it("creates discriminated placed part objects with source and input values", () => {
    const object = createPlacedPartObject("battery", "demo", { level: "full" })

    expect(object).toEqual({
      kind: "placed-part",
      id: "lab-object-1",
      storyId: "battery",
      sourceId: "demo",
      inputValues: { level: "full" },
    })
    expect(isPlacedPartObject(object)).toBe(true)
    expect(isLiveDeviceObject(object)).toBe(false)
  })

  it("creates discriminated live device objects without source/story state", () => {
    const object = createLiveDeviceObject("thor")

    expect(object).toEqual({
      kind: "live-device",
      id: "lab-object-1",
      deviceId: "thor",
      inputValues: {},
    })
    expect(isLiveDeviceObject(object)).toBe(true)
    expect(isPlacedPartObject(object)).toBe(false)
  })

  it("moves either object kind without changing unrelated objects", () => {
    const part = createPlacedPartObject("battery", "demo", {})
    const device = createLiveDeviceObject("thor")

    const moved = moveCanvasObject([part, device], device.id, 42, 84)

    expect(moved[0]).toBe(part)
    expect(moved[1]).toEqual({ ...device, x: 42, y: 84 })
  })

  it("removes objects by stable canvas object id", () => {
    const part = createPlacedPartObject("battery", "demo", {})
    const device = createLiveDeviceObject("thor")

    expect(removeCanvasObject([part, device], part.id)).toEqual([device])
  })

  it("reports bounds for placed parts and dynamic live device cards", () => {
    const part = createPlacedPartObject("battery", "demo", {}, { x: 10, y: 20 })
    const device = createLiveDeviceObject("thor", { x: 100, y: 200 })

    expect(objectBounds(part)).toMatchObject({ x: 10, y: 20, w: 540, h: 480 })
    expect(objectBounds(device, { w: 640, h: 420 })).toEqual({
      x: 100,
      y: 200,
      w: 640,
      h: 420,
    })
  })

  it("falls back to default positions and live device bounds", () => {
    const objects: readonly LabCanvasObject[] = [
      createPlacedPartObject("battery", "demo", {}),
      createLiveDeviceObject("thor"),
    ]

    expect(objectBounds(objects[0])).toMatchObject({ x: 0, y: 0 })
    expect(objectBounds(objects[1])).toEqual({ x: 0, y: 0, w: 420, h: 360 })
  })

  it("does not churn live device objects when measured size is unchanged", () => {
    const objects: readonly LabCanvasObject[] = [createLiveDeviceObject("thor")]
    const measured = updateLiveDeviceObjectSize(objects, objects[0].id, {
      w: 640,
      h: 420,
    })

    expect(measured).not.toBe(objects)
    expect(
      updateLiveDeviceObjectSize(measured, objects[0].id, { w: 640, h: 420 }),
    ).toBe(measured)
  })
})
