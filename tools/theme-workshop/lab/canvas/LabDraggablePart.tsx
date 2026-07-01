import { Trash2 } from "lucide-react"
import type { ScreenConfig } from "../../device-lab"
import type { Story } from "../../types"
import { LabCanvasInteractionBar } from "../concepts/LabCanvasInteractionBar"
import { useLab } from "../Lab.context"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import {
  objectInputsForStory,
  resolveObjectInputValues,
  variantInput,
} from "../model/lab-object-inputs"
import { partMetaLabel, stateVariantFor } from "../model/lab-part-model"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import { LAB_BIND_MIME } from "../panels/LabSourcesPanel"
import { LabInspectableContent } from "./LabInspectableContent"
import { LabScreenFrame } from "./LabScreenFrame"

function parseBind(value: string): { axis: "sourceId"; value: string } | null {
  const [axis, id] = value.split(":")
  if (axis === "source" && id) return { axis: "sourceId", value: id }
  return null
}

/**
 * One placed part on the Compose board: the part rendered inside a single
 * logical screen frame with a drag bar carrying only identity, drag, and
 * remove. Its bindings (data source plus product inputs) are edited in the
 * selection-scoped Inspector, which scales to any number of inputs. Compose is
 * device-agnostic: the selected screen contributes aspect ratio only.
 */
export function LabDraggablePart({
  instance,
  story,
  storyMeta,
  byId,
  screen,
  scale,
  selected,
  pickMode,
  innerSelection,
  onSelect,
  onInnerSelect,
  onBind,
  onMove,
  onRemove,
  onDeleteTake,
  onPromoteTake,
  onGenerateTakes,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly storyMeta?: import("../design-pass/design-pass-model").LabDesignPassStoryMeta
  readonly byId: ReadonlyMap<string, Story>
  readonly screen?: ScreenConfig
  readonly scale: number
  readonly selected: boolean
  readonly pickMode: boolean
  readonly innerSelection: LabPreviewSelection | null
  readonly onSelect: (id: string) => void
  readonly onInnerSelect: (selection: LabPreviewSelection | null) => void
  readonly onBind: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => void
  readonly onMove: (id: string, x: number, y: number) => void
  readonly onRemove: (id: string) => void
  readonly onDeleteTake?: (storyId: string) => void
  readonly onPromoteTake?: (storyId: string) => void
  readonly onGenerateTakes?: (
    id: string,
    request: { readonly prompt: string; readonly count: number },
  ) => void
}) {
  const { adapter } = useLab()
  const x = instance.x ?? 24
  const y = instance.y ?? 24
  const inputs = objectInputsForStory(story, byId, adapter)
  const inputValues = resolveObjectInputValues(inputs, instance.inputValues)
  const selectedVariantInput = variantInput(inputs)
  // Fall back to the part's own representative when the requested variant tag
  // is stale or unavailable, so a card always renders something.
  const variantValue = selectedVariantInput
    ? (inputValues[selectedVariantInput.id] ??
      selectedVariantInput.defaultValue)
    : null
  const variant = selectedVariantInput
    ? (stateVariantFor(
        story,
        typeof variantValue === "string"
          ? variantValue
          : String(selectedVariantInput.defaultValue),
        byId,
      ) ?? story)
    : story
  const fill =
    Boolean(variant.surface) ||
    variant.layer === "page" ||
    variant.layer === "template"
  const metaLabel = partMetaLabel(storyMeta)
  const canDeleteTake = storyMeta?.role === "take"
  const canPromoteTake = canDeleteTake && storyMeta?.promoted !== true

  const renderBody = () => {
    // A binding-capable adapter may render any placed part through the real
    // data edge or component input it owns. Page parts use app-edge data; atoms
    // and molecules can use the same selected input values to feed their real
    // component props instead of falling back to pre-baked snapshots.
    const node = adapter.renderSurfacePart
      ? adapter.renderSurfacePart(variant, {
          sourceId: instance.sourceId,
          inputValues,
        })
      : variant.render()
    const scoped = adapter.previewScope ? adapter.previewScope(node) : node
    return (
      <div className="lab-part-mount" data-fill={fill ? "true" : undefined}>
        <LabPreviewBoundary label={variant.name}>{scoped}</LabPreviewBoundary>
      </div>
    )
  }

  return (
    <fieldset
      className={`pt-object${selected ? " is-selected" : ""}`}
      style={{ left: x, top: y }}
      onPointerDownCapture={() => onSelect(instance.id)}
      onDragOver={event => {
        if (event.dataTransfer.types.includes(LAB_BIND_MIME))
          event.preventDefault()
      }}
      onDrop={event => {
        const bind = parseBind(event.dataTransfer.getData(LAB_BIND_MIME))
        if (bind) onBind(instance.id, { [bind.axis]: bind.value })
      }}
    >
      <header
        className="pt-object-bar"
        onPointerDown={event => {
          const start = { x: event.clientX, y: event.clientY, ox: x, oy: y }
          const target = event.currentTarget
          target.setPointerCapture(event.pointerId)
          const move = (next: PointerEvent) =>
            onMove(
              instance.id,
              start.ox + (next.clientX - start.x) / scale,
              start.oy + (next.clientY - start.y) / scale,
            )
          const up = (next: PointerEvent) => {
            target.releasePointerCapture(next.pointerId)
            target.removeEventListener("pointermove", move)
            target.removeEventListener("pointerup", up)
          }
          target.addEventListener("pointermove", move)
          target.addEventListener("pointerup", up)
        }}
      >
        <span className={`pt-layer-tag layer-${story.layer}`}>
          {story.layer}
        </span>
        <span className="pt-object-title">{story.name}</span>
        {metaLabel ? <span className="pt-work-badge">{metaLabel}</span> : null}
        {canPromoteTake ? (
          <button
            type="button"
            className="pt-object-promote"
            aria-label={`Promote Take ${story.name}`}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onPromoteTake?.(story.id)}
          >
            Promote
          </button>
        ) : null}
        {canDeleteTake ? (
          <button
            type="button"
            className="pt-object-remove"
            aria-label={`Delete Take ${story.name}`}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onDeleteTake?.(story.id)}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="pt-object-remove"
          aria-label={`Remove ${story.name}`}
          onPointerDown={event => event.stopPropagation()}
          onClick={() => onRemove(instance.id)}
        >
          ×
        </button>
      </header>
      <div className="pt-object-body">
        <LabInspectableContent
          scopeId={instance.id}
          pickMode={pickMode}
          selection={innerSelection}
          onSelect={onInnerSelect}
        >
          <LabScreenFrame screen={screen}>{renderBody()}</LabScreenFrame>
        </LabInspectableContent>
      </div>
      {selected ? (
        <div className="lab-canvas-ask-slot">
          <LabCanvasInteractionBar
            targetName={story.name}
            onGenerate={request => onGenerateTakes?.(instance.id, request)}
          />
        </div>
      ) : null}
    </fieldset>
  )
}
