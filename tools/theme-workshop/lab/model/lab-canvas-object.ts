import type { DeviceConfig } from "../../device-lab"
import type { LabInputValue } from "./lab-source-state"
import { PLACEMENT_CELL, type Rect, type Size } from "./lab-canvas-placement"

export type LabObjectInputValues = Readonly<Record<string, LabInputValue>>

export type LabCanvasObjectBase = {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

export type LabPlacedPartObject = LabCanvasObjectBase & {
  readonly kind: "placed-part"
  readonly storyId: string
  readonly sourceId: string
  /** Placed-object input values keyed by independent input id. */
  readonly inputValues: LabObjectInputValues
}

export type LabLiveDeviceObject = LabCanvasObjectBase & {
  readonly kind: "live-device"
  readonly deviceId: string
  readonly measuredSize?: Size
}

export type LabCanvasObject = LabPlacedPartObject | LabLiveDeviceObject

const DEFAULT_LIVE_DEVICE_SIZE: Size = { w: 420, h: 360 }

let objectSeq = 0

export function nextCanvasObjectId(): string {
  objectSeq += 1
  return `lab-object-${objectSeq}`
}

export function resetCanvasObjectIdCounterForTest(): void {
  objectSeq = 0
}

export function createPlacedPartObject(
  storyId: string,
  sourceId: string,
  inputValues: LabObjectInputValues,
  position?: { readonly x: number; readonly y: number },
): LabPlacedPartObject {
  return {
    kind: "placed-part",
    id: nextCanvasObjectId(),
    storyId,
    sourceId,
    inputValues,
    ...position,
  }
}

export function createLiveDeviceObject(
  deviceId: string,
  position?: { readonly x: number; readonly y: number },
): LabLiveDeviceObject {
  return { kind: "live-device", id: nextCanvasObjectId(), deviceId, ...position }
}

export function isPlacedPartObject(
  object: LabCanvasObject,
): object is LabPlacedPartObject {
  return object.kind === "placed-part"
}

export function isLiveDeviceObject(
  object: LabCanvasObject,
): object is LabLiveDeviceObject {
  return object.kind === "live-device"
}

export function moveCanvasObject(
  objects: readonly LabCanvasObject[],
  id: string,
  x: number,
  y: number,
): readonly LabCanvasObject[] {
  return objects.map(object => (object.id === id ? { ...object, x, y } : object))
}

export function removeCanvasObject(
  objects: readonly LabCanvasObject[],
  id: string,
): readonly LabCanvasObject[] {
  return objects.filter(object => object.id !== id)
}

export function bindPlacedPartObject(
  objects: readonly LabCanvasObject[],
  id: string,
  patch: Partial<Pick<LabPlacedPartObject, "sourceId" | "x" | "y">>,
): readonly LabCanvasObject[] {
  return objects.map(object =>
    object.id === id && object.kind === "placed-part"
      ? { ...object, ...patch }
      : object,
  )
}

export function bindPlacedPartInput(
  objects: readonly LabCanvasObject[],
  id: string,
  inputId: string,
  value: LabInputValue,
): readonly LabCanvasObject[] {
  return objects.map(object =>
    object.id === id && object.kind === "placed-part"
      ? {
          ...object,
          inputValues: {
            ...object.inputValues,
            [inputId]: value,
          },
        }
      : object,
  )
}

export function updateLiveDeviceObjectSize(
  objects: readonly LabCanvasObject[],
  id: string,
  measuredSize: Size,
): readonly LabCanvasObject[] {
  let changed = false
  const next = objects.map(object => {
    if (object.id !== id || object.kind !== "live-device") return object
    if (
      object.measuredSize?.w === measuredSize.w &&
      object.measuredSize.h === measuredSize.h
    ) {
      return object
    }
    changed = true
    return { ...object, measuredSize }
  })
  return changed ? next : objects
}

export function liveDeviceObjectSize(
  device?: DeviceConfig | null,
  pxPerMm = 1,
): Size {
  if (!device) return DEFAULT_LIVE_DEVICE_SIZE
  const screens = device.screens?.length ? device.screens : [device]
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  let cursorY = 0
  for (const screen of screens) {
    const width = screen.widthMm * pxPerMm
    const height = screen.heightMm * pxPerMm
    const placement = "placement" in screen ? screen.placement : undefined
    const x = placement === "right" ? maxX : 0
    const y = placement === "below" ? cursorY : 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
    if (placement === "below" || !placement) cursorY = maxY
  }
  return {
    w: Math.max(DEFAULT_LIVE_DEVICE_SIZE.w, Math.ceil(maxX - minX) + 96),
    h: Math.max(DEFAULT_LIVE_DEVICE_SIZE.h, Math.ceil(maxY - minY) + 128),
  }
}

export function objectBounds(
  object: LabCanvasObject,
  liveSize?: Size,
): Rect {
  const x = object.x ?? 0
  const y = object.y ?? 0
  if (object.kind === "placed-part") {
    return { x, y, w: PLACEMENT_CELL.w, h: PLACEMENT_CELL.h }
  }
  const size = liveSize ?? object.measuredSize ?? DEFAULT_LIVE_DEVICE_SIZE
  return { x, y, ...size }
}
