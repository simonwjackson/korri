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
