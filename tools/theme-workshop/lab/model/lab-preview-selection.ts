import type { StoryLayer } from "../../types"

export const LAB_PREVIEW_PART_ATTR = "data-korri-part"
export const LAB_PREVIEW_LAYER_ATTR = "data-korri-layer"
export const LAB_PREVIEW_NAME_ATTR = "data-korri-name"
export const LAB_PREVIEW_INSTANCE_ATTR = "data-korri-instance-id"

export interface LabPreviewPartTarget {
  readonly partId: string
  readonly layer: StoryLayer
  readonly name: string
  readonly instanceId?: string
}

export interface LabPreviewSelection {
  readonly scopeId: string
  /** Nearest clicked part first, then its parents. */
  readonly targets: readonly LabPreviewPartTarget[]
  readonly activeIndex: number
}

const STORY_LAYERS: readonly StoryLayer[] = [
  "page",
  "template",
  "organism",
  "molecule",
  "atom",
]

export function previewSelectionFromEventTarget(
  target: EventTarget | null,
  scopeId: string,
): LabPreviewSelection | null {
  if (!(target instanceof Element)) return null
  const targets = previewPartStackFromElement(target)
  if (targets.length === 0) return null
  return { scopeId, targets, activeIndex: 0 }
}

export function activePreviewTarget(
  selection: LabPreviewSelection | null,
): LabPreviewPartTarget | null {
  if (!selection) return null
  return (
    selection.targets[selection.activeIndex] ?? selection.targets[0] ?? null
  )
}

export function selectPreviewTargetIndex(
  selection: LabPreviewSelection,
  activeIndex: number,
): LabPreviewSelection {
  const max = Math.max(0, selection.targets.length - 1)
  return {
    ...selection,
    activeIndex: Math.max(0, Math.min(max, activeIndex)),
  }
}

export function elementMatchesPreviewTarget(
  element: Element,
  target: LabPreviewPartTarget,
): boolean {
  return (
    element.getAttribute(LAB_PREVIEW_PART_ATTR) === target.partId &&
    element.getAttribute(LAB_PREVIEW_LAYER_ATTR) === target.layer &&
    element.getAttribute(LAB_PREVIEW_NAME_ATTR) === target.name &&
    (target.instanceId === undefined ||
      element.getAttribute(LAB_PREVIEW_INSTANCE_ATTR) === target.instanceId)
  )
}

function previewPartStackFromElement(
  element: Element,
): readonly LabPreviewPartTarget[] {
  const out: LabPreviewPartTarget[] = []
  const seen = new Set<string>()
  let current: Element | null = element
  while (current) {
    const target = previewTargetFromElement(current)
    if (target) {
      const key = `${target.partId}:${target.instanceId ?? ""}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(target)
      }
    }
    current = current.parentElement
  }
  return out
}

function previewTargetFromElement(
  element: Element,
): LabPreviewPartTarget | null {
  const partId = element.getAttribute(LAB_PREVIEW_PART_ATTR)
  const layer = element.getAttribute(LAB_PREVIEW_LAYER_ATTR)
  const name = element.getAttribute(LAB_PREVIEW_NAME_ATTR)
  if (!partId || !name || !isStoryLayer(layer)) return null
  const instanceId =
    element.getAttribute(LAB_PREVIEW_INSTANCE_ATTR) ?? undefined
  return { partId, layer, name, ...(instanceId ? { instanceId } : {}) }
}

function isStoryLayer(value: string | null): value is StoryLayer {
  return Boolean(value && STORY_LAYERS.includes(value as StoryLayer))
}
