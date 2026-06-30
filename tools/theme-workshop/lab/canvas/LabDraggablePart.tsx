import type { ScreenConfig } from "../../device-lab"
import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import { stateVariantFor } from "../model/lab-part-model"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import { isSourceStatus } from "../model/lab-source-state"
import { LAB_BIND_MIME } from "../panels/LabSourcesPanel"
import { LabScreenFrame } from "./LabScreenFrame"

function parseBind(
  value: string,
): { axis: "sourceId" | "stateId"; value: string } | null {
  const [axis, id] = value.split(":")
  if (axis === "source" && id) return { axis: "sourceId", value: id }
  if (axis === "state" && isSourceStatus(id))
    return { axis: "stateId", value: id }
  return null
}

/**
 * One placed part on the Compose board: the part rendered inside a single
 * logical screen frame with a drag bar carrying only identity, drag, and
 * remove. Its bindings (data source, state, extra axes) are edited in the
 * selection-scoped Inspector, which scales to any number of axes. Compose is
 * device-agnostic: the selected screen contributes aspect ratio only.
 */
export function LabDraggablePart({
  instance,
  story,
  byId,
  screen,
  scale,
  selected,
  onSelect,
  onBind,
  onMove,
  onRemove,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly byId: ReadonlyMap<string, Story>
  readonly screen?: ScreenConfig
  readonly scale: number
  readonly selected: boolean
  readonly onSelect: (id: string) => void
  readonly onBind: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>,
  ) => void
  readonly onMove: (id: string, x: number, y: number) => void
  readonly onRemove: (id: string) => void
}) {
  const { adapter } = useLab()
  const x = instance.x ?? 24
  const y = instance.y ?? 24
  // Fall back to the part's own representative when the requested state isn't in
  // its family (e.g. a state inherited from another card), so a card always
  // renders something.
  const variant = stateVariantFor(story, instance.stateId, byId) ?? story
  const fill =
    Boolean(variant.surface) ||
    variant.layer === "page" ||
    variant.layer === "template"

  const renderBody = () => {
    // Surface/page parts of a binding-capable adapter render through the real
    // data edge, seeded for this object's source + Data state + extra-axis pins
    // (e.g. foreground), so the drag bar's dropdowns swap the actual data (like
    // Preview). Other parts (atoms/molecules) keep their baked render.
    const node =
      adapter.renderSurfacePart && fill
        ? adapter.renderSurfacePart(variant, {
            sourceId: instance.sourceId,
            stateId: instance.stateId,
            axisStateIds: instance.axisStateIds,
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
        if (bind)
          onBind(instance.id, {
            [bind.axis]: bind.value,
          } as Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>)
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
        <LabScreenFrame screen={screen}>{renderBody()}</LabScreenFrame>
      </div>
    </fieldset>
  )
}
