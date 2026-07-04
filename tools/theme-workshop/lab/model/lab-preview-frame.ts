/**
 * Preview-frame sizing for the Compose board.
 *
 * The board frame used to be locked to one fixed width at the first device's
 * aspect (RG353M), so every placed part was stuck at that shape. This is the
 * shared, persisted control behind a resizable frame: a chosen device whose
 * aspect the frame takes (or "fit" = the part's own logical screen aspect) plus
 * an arbitrary width the user drags. It is a tiny external store rather than
 * React state so every placed part's frame reads and writes ONE setting — resize
 * or switch device once, and all previews follow.
 */
import { useSyncExternalStore } from "react"
import type { DeviceConfig } from "../../device-lab"

export interface LabPreviewFrame {
  /** Device id whose aspect the frame takes; null = fit the part's own screen. */
  readonly deviceId: string | null
  /** Frame width in layout px (height derives from the aspect). */
  readonly width: number
}

const STORAGE_KEY = "lab-preview-frame"
const DEFAULT_FRAME: LabPreviewFrame = { deviceId: null, width: 520 }

export const LAB_FRAME_MIN_WIDTH = 220
export const LAB_FRAME_MAX_WIDTH = 1600

export function clampFrameWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_FRAME.width
  return Math.max(
    LAB_FRAME_MIN_WIDTH,
    Math.min(LAB_FRAME_MAX_WIDTH, Math.round(width)),
  )
}

let current = readStoredFrame()
const listeners = new Set<() => void>()

function readStoredFrame(): LabPreviewFrame {
  if (typeof window === "undefined") return DEFAULT_FRAME
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FRAME
    const parsed = JSON.parse(raw) as Partial<LabPreviewFrame>
    return {
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : null,
      width: clampFrameWidth(Number(parsed.width)),
    }
  } catch {
    return DEFAULT_FRAME
  }
}

export function getPreviewFrame(): LabPreviewFrame {
  return current
}

export function setPreviewFrame(patch: Partial<LabPreviewFrame>): void {
  const next: LabPreviewFrame = {
    deviceId: patch.deviceId !== undefined ? patch.deviceId : current.deviceId,
    width:
      patch.width !== undefined ? clampFrameWidth(patch.width) : current.width,
  }
  if (next.deviceId === current.deviceId && next.width === current.width) return
  current = next
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore storage failures (private mode/quota); the size just won't persist.
    }
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLabPreviewFrame(): LabPreviewFrame {
  return useSyncExternalStore(subscribe, getPreviewFrame, () => DEFAULT_FRAME)
}

/** Reset for tests so a persisted value never leaks between cases. */
export function resetPreviewFrameForTest(): void {
  current = DEFAULT_FRAME
  for (const listener of listeners) listener()
}

/** The screen a device's aspect should come from: its primary panel (or the
 * device itself for a single-screen device), never a secondary/companion. */
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

/** A device-shaped default width: normalise on a common height so switching
 * device presets reads as a change of shape (a TV is wide, a handheld square-ish)
 * rather than every device landing at the same width. Still freely resizable. */
export function devicePresetWidth(device: DeviceConfig): number {
  const TARGET_HEIGHT = 380
  return clampFrameWidth(Math.round(TARGET_HEIGHT * deviceAspect(device)))
}

export function deviceFaceLabel(device: DeviceConfig): string {
  const face = primaryFace(device)
  return `${face.widthMm}×${face.heightMm}mm`
}
