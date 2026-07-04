/**
 * Physical frame sizing for Compose placed parts.
 *
 * Each placed part owns its own frame: a chosen device (per part, NOT shared
 * across the canvas) whose real physical size (millimetres × the calibrated
 * pxPerMm) the frame takes — exactly like a live device — plus an optional
 * custom width/height set by dragging the corner handle. These are pure helpers;
 * the per-part device id and custom size live on the placed-part object.
 */
import type { DeviceConfig } from "../../device-lab"

export const LAB_FRAME_MIN_WIDTH = 120
export const LAB_FRAME_MAX_WIDTH = 8000

export function clampFrameWidth(width: number): number {
  if (!Number.isFinite(width)) return LAB_FRAME_MIN_WIDTH
  return Math.max(
    LAB_FRAME_MIN_WIDTH,
    Math.min(LAB_FRAME_MAX_WIDTH, Math.round(width)),
  )
}

/** The screen a device's aspect/size should come from: its primary panel (or
 * the device itself for a single-screen device), never a secondary/companion. */
function primaryFace(device: DeviceConfig): {
  readonly widthMm: number
  readonly heightMm: number
} {
  const primary =
    device.screens?.find(screen => screen.role !== "secondary") ??
    device.screens?.[0]
  return primary ?? { widthMm: device.widthMm, heightMm: device.heightMm }
}

export function deviceAspect(device: DeviceConfig): number {
  const face = primaryFace(device)
  return face.heightMm > 0 ? face.widthMm / face.heightMm : 16 / 10
}

export interface LabFramePx {
  readonly width: number
  readonly height: number
}

/**
 * Physical pixel size for a placed-part frame — the same millimetres × pxPerMm
 * math a live device uses, so choosing the device actually resizes the frame
 * (a TV is much bigger than a handheld) instead of only changing its aspect.
 *
 * - a custom width AND height set (drag-to-resize): those win verbatim, so the
 *   frame can be resized freely like any rectangle (no aspect constraint).
 * - a device selected: the device's primary face, millimetres × pxPerMm.
 * - otherwise: the part's own logical screen, millimetres × pxPerMm.
 */
export function framePhysicalSize(options: {
  readonly device: DeviceConfig | null
  readonly logical: { readonly widthMm: number; readonly heightMm: number }
  readonly pxPerMm: number
  readonly customWidth?: number
  readonly customHeight?: number
}): LabFramePx {
  const { device, logical, pxPerMm, customWidth, customHeight } = options
  if (customWidth !== undefined && customHeight !== undefined) {
    return {
      width: clampFrameWidth(customWidth),
      height: clampFrameWidth(customHeight),
    }
  }
  const face = device ? primaryFace(device) : logical
  return {
    width: Math.max(1, Math.round(face.widthMm * pxPerMm)),
    height: Math.max(1, Math.round(face.heightMm * pxPerMm)),
  }
}

export function deviceFaceLabel(device: DeviceConfig): string {
  const face = primaryFace(device)
  return `${face.widthMm}×${face.heightMm}mm`
}
