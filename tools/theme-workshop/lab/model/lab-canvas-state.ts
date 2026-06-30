import type { SourceStatus } from "./lab-source-state"

export type LabCanvasView = "device" | "compose"
export type LabChromeMode = "dock" | "float" | "focus"
export type LabWorkshopTool = "select" | "hand"
export type LabWorkshopCommand = "zoom-out" | "zoom-in" | "reset-view" | "tidy"
export type LabWorkshopCommandSignal = {
  readonly id: number
  readonly command: LabWorkshopCommand
}

export type LabObjectInstance = {
  readonly id: string
  readonly storyId: string
  readonly sourceId: string
  readonly stateId: SourceStatus
  /** Extra per-axis pins for a multi-machine surface part (e.g. foreground),
   * keyed by axis id. The primary `stateId` is the part's Data state. */
  readonly axisStateIds?: Readonly<Record<string, SourceStatus>>
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
      out.push(
        createObjectInstance(storyId, defaults.sourceId, defaults.stateId),
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
  patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId" | "x" | "y">>,
): readonly LabObjectInstance[] {
  return instances.map(instance =>
    instance.id === id ? { ...instance, ...patch } : instance,
  )
}

/** Set one extra-axis pin (e.g. foreground) on an object, leaving others. */
export function bindObjectAxisState(
  instances: readonly LabObjectInstance[],
  id: string,
  axisId: string,
  stateId: SourceStatus,
): readonly LabObjectInstance[] {
  return instances.map(instance =>
    instance.id === id
      ? {
          ...instance,
          axisStateIds: { ...instance.axisStateIds, [axisId]: stateId },
        }
      : instance,
  )
}
