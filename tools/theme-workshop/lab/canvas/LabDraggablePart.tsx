import {
  type DeviceConfig,
  DeviceFrame,
  type ScreenConfig,
} from "../../device-lab"
import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import { statesForStory, stateVariantFor } from "../model/lab-part-model"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import {
  isSourceStatus,
  type LabSourceOption,
  type SourceStatus,
} from "../model/lab-source-state"
import { LAB_BIND_MIME } from "../panels/LabSourcesPanel"

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
 * One placed part on the workshop board: the part rendered inside a single
 * device screen frame (sized to physical mm) with a drag bar carrying its own
 * data source / state / remove. The board's camera handles zoom, so the frame
 * renders at true physical size here. The Workshop shows exactly one screen —
 * multi-screen arrangement is the Preview's job — so a multi-screen device's
 * chosen screen arrives via `screen`.
 */
export function LabDraggablePart({
  instance,
  story,
  byId,
  device,
  screen,
  sources,
  scale,
  onBind,
  onBindAxis,
  onMove,
  onRemove,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly byId: ReadonlyMap<string, Story>
  readonly device: DeviceConfig
  readonly screen: ScreenConfig
  readonly sources: readonly LabSourceOption[]
  readonly scale: number
  readonly onBind: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId" | "stateId">>,
  ) => void
  readonly onBindAxis: (id: string, axisId: string, stateId: string) => void
  readonly onMove: (id: string, x: number, y: number) => void
  readonly onRemove: (id: string) => void
}) {
  const { adapter, pxPerMm } = useLab()
  const x = instance.x ?? 24
  const y = instance.y ?? 24
  const states = statesForStory(story, byId)
  // Fall back to the part's own representative when the requested state isn't in
  // its family (e.g. a state inherited from another card), so a card always
  // renders something.
  const variant = stateVariantFor(story, instance.stateId, byId) ?? story
  const fill =
    Boolean(variant.surface) ||
    variant.layer === "page" ||
    variant.layer === "template"
  // Extra per-object dials (beyond Data) for an edge-rendered surface part.
  const extraAxes = fill ? (adapter.surfacePartAxes?.(story) ?? []) : []

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
    <section
      className="pt-object"
      style={{ left: x, top: y }}
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
        <label
          className="pt-object-source"
          onPointerDown={event => event.stopPropagation()}
        >
          <span className="pt-object-source-icon" aria-hidden>
            ◈
          </span>
          <select
            value={instance.sourceId}
            aria-label={`Data source for ${story.name}`}
            onChange={event =>
              onBind(instance.id, { sourceId: event.target.value })
            }
          >
            {sources.map(source => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="pt-object-source"
          onPointerDown={event => event.stopPropagation()}
        >
          <span className="pt-object-source-icon pt-icon-state" aria-hidden>
            ◆
          </span>
          <select
            value={instance.stateId}
            aria-label={`State for ${story.name}`}
            onChange={event =>
              onBind(instance.id, {
                stateId: event.target.value as SourceStatus,
              })
            }
          >
            {states.map(state => (
              <option key={state.id} value={state.id}>
                {state.label}
              </option>
            ))}
          </select>
        </label>
        {extraAxes.map(axis => (
          <label
            key={axis.id}
            className="pt-object-source"
            onPointerDown={event => event.stopPropagation()}
          >
            <span className="pt-object-source-icon pt-icon-state" aria-hidden>
              ◆
            </span>
            <select
              value={instance.axisStateIds?.[axis.id] ?? axis.states[0]?.id ?? ""}
              aria-label={`${axis.label} for ${story.name}`}
              onChange={event =>
                onBindAxis(instance.id, axis.id, event.target.value)
              }
            >
              {axis.states.map(state => (
                <option key={state.id} value={state.id}>
                  {state.label}
                </option>
              ))}
            </select>
          </label>
        ))}
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
        <div data-lab-device-id={device.id} data-lab-screen-id={screen.id}>
          <DeviceFrame
            widthMm={screen.widthMm}
            heightMm={screen.heightMm}
            pxPerMm={pxPerMm}
            bezel={screen.bezel}
          >
            {renderBody()}
          </DeviceFrame>
        </div>
      </div>
    </section>
  )
}
