import type { SourceStatus } from "./lab-source-state"

export type LabCanvasView = "device" | "compose"
export type LabChromeMode = "dock" | "float" | "focus"
export type LabWorkshopTool = "select" | "hand"
export type LabWorkshopCommand = "zoom-out" | "zoom-in" | "reset-view" | "tidy"
export type LabWorkshopCommandSignal = {
  readonly id: number
  readonly command: LabWorkshopCommand
}

export type LabObjectStateValues = Readonly<Record<string, SourceStatus>>

export type LabObjectInstance = {
  readonly id: string
  readonly storyId: string
  readonly sourceId: string
  /** Compose-object state values keyed by independent state-group id. */
  readonly stateGroupValues: LabObjectStateValues
  readonly x?: number
  readonly y?: number
}

export type LabCamera = {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export const DEFAULT_CANVAS_VIEW: LabCanvasView = "device"
export const DEFAULT_CHROME_MODE: LabChromeMode = "dock"
export const DEFAULT_CAMERA: LabCamera = { x: 24, y: 24, scale: 1 }

/** Camera that centers `rect` (world coords) in a `viewport` (px) at the
 * camera's current scale, so a placed/selected object is framed on screen. */
export function frameCameraOn(
  camera: LabCamera,
  rect: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  },
  viewport: { readonly w: number; readonly h: number },
): LabCamera {
  const centerX = (rect.x + rect.w / 2) * camera.scale
  const centerY = (rect.y + rect.h / 2) * camera.scale
  return {
    scale: camera.scale,
    x: viewport.w / 2 - centerX,
    y: viewport.h / 2 - centerY,
  }
}

/** Linear interpolation between two cameras; `t` is clamped to [0, 1]. */
export function lerpCamera(
  from: LabCamera,
  to: LabCamera,
  t: number,
): LabCamera {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    scale: from.scale + (to.scale - from.scale) * k,
  }
}

/** Whether a world-space `rect` is fully inside the `viewport` under `camera`
 * (optionally inset by `margin`). Lets selection skip a pointless re-frame when
 * the card is already on screen. */
export function isRectFullyVisible(
  camera: LabCamera,
  rect: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  },
  viewport: { readonly w: number; readonly h: number },
  margin = 0,
): boolean {
  const left = rect.x * camera.scale + camera.x
  const top = rect.y * camera.scale + camera.y
  const right = left + rect.w * camera.scale
  const bottom = top + rect.h * camera.scale
  return (
    left >= margin &&
    top >= margin &&
    right <= viewport.w - margin &&
    bottom <= viewport.h - margin
  )
}

/** Whether `from` is within `epsilon` of `to` on every axis, so a tween can stop. */
export function cameraSettled(
  from: LabCamera,
  to: LabCamera,
  epsilon = 0.5,
): boolean {
  return (
    Math.abs(from.x - to.x) <= epsilon &&
    Math.abs(from.y - to.y) <= epsilon &&
    Math.abs(from.scale - to.scale) <= epsilon / 100
  )
}

let objectSeq = 0
export function nextObjectId(): string {
  objectSeq += 1
  return `lab-object-${objectSeq}`
}

export function resetObjectIdCounterForTest(): void {
  objectSeq = 0
}

export function createObjectInstance(
  storyId: string,
  sourceId: string,
  stateGroupValues: LabObjectStateValues,
): LabObjectInstance {
  return { id: nextObjectId(), storyId, sourceId, stateGroupValues }
}

export function reconcileInstancesWithSelection(
  instances: readonly LabObjectInstance[],
  selectedStoryIds: readonly string[],
  defaults: {
    readonly sourceId: string
    readonly stateGroupValuesForStory: (storyId: string) => LabObjectStateValues
  },
): readonly LabObjectInstance[] {
  const selected = new Set(selectedStoryIds)
  const kept = instances.filter(instance => selected.has(instance.storyId))
  const out = [...kept]
  for (const storyId of selectedStoryIds) {
    if (!out.some(instance => instance.storyId === storyId)) {
      out.push(
        createObjectInstance(
          storyId,
          defaults.sourceId,
          defaults.stateGroupValuesForStory(storyId),
        ),
      )
    }
  }
  return out
}

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(0.25, Math.min(2.5, value))
}

export function bindObjectInstance(
  instances: readonly LabObjectInstance[],
  id: string,
  patch: Partial<Pick<LabObjectInstance, "sourceId" | "x" | "y">>,
): readonly LabObjectInstance[] {
  return instances.map(instance =>
    instance.id === id ? { ...instance, ...patch } : instance,
  )
}

export function bindObjectStateGroup(
  instances: readonly LabObjectInstance[],
  id: string,
  groupId: string,
  stateId: SourceStatus,
): readonly LabObjectInstance[] {
  return instances.map(instance =>
    instance.id === id
      ? {
          ...instance,
          stateGroupValues: {
            ...instance.stateGroupValues,
            [groupId]: stateId,
          },
        }
      : instance,
  )
}
