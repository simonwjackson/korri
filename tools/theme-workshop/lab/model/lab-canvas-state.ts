import type { SourceStatus } from "./lab-source-state"

export type LabCanvasView = "surface" | "gallery" | "selection" | "canvas" | "matrix"
export type LabChromeMode = "dock" | "float" | "focus"

export type LabObjectInstance = {
  readonly id: string
  readonly storyId: string
  readonly sourceId: string
  readonly stateId: SourceStatus
  readonly x?: number
  readonly y?: number
}

export type LabCamera = {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export const DEFAULT_CANVAS_VIEW: LabCanvasView = "surface"
export const DEFAULT_CHROME_MODE: LabChromeMode = "dock"
export const DEFAULT_CAMERA: LabCamera = { x: 24, y: 24, scale: 1 }

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
  stateId: SourceStatus,
): LabObjectInstance {
  return { id: nextObjectId(), storyId, sourceId, stateId }
}

export function reconcileInstancesWithSelection(
  instances: readonly LabObjectInstance[],
  selectedStoryIds: readonly string[],
  defaults: { readonly sourceId: string; readonly stateId: SourceStatus },
): readonly LabObjectInstance[] {
  const selected = new Set(selectedStoryIds)
  const kept = instances.filter(instance => selected.has(instance.storyId))
  const out = [...kept]
  for (const storyId of selectedStoryIds) {
    if (!out.some(instance => instance.storyId === storyId)) {
      out.push(createObjectInstance(storyId, defaults.sourceId, defaults.stateId))
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
  patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId" | "x" | "y">>,
): readonly LabObjectInstance[] {
  return instances.map(instance =>
    instance.id === id ? { ...instance, ...patch } : instance,
  )
}
