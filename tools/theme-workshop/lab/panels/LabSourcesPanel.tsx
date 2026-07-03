import type { LabSourceOption } from "../model/lab-source-state"

export const LAB_BIND_MIME = "application/x-korri-lab-bind"

/** Display "kind" badge: the first/default source is local fixture data; any
 * source whose id or label references a live daemon (korrid) reads as live. */
function sourceKind(
  source: LabSourceOption,
  index: number,
): "fixture" | "live" {
  const text = `${source.id} ${source.label}`.toLowerCase()
  if (
    text.includes("korri") ||
    text.includes("live") ||
    text.includes("daemon")
  )
    return "live"
  return index === 0 ? "fixture" : "live"
}

export function LabSourcesPanel({
  sources,
  activeId,
  onSelect,
}: {
  readonly sources: readonly LabSourceOption[]
  readonly activeId: string
  readonly onSelect: (id: string) => void
}) {
  return (
    <div className="pt-sources">
      <div className="pt-sources-hint">
        Where data comes from. <b>Drag</b> onto an object or tap to make it
        active.
      </div>
      {sources.map((source, index) => (
        <div
          key={source.id}
          className={`pt-source-row${activeId === source.id ? " is-on" : ""}`}
          draggable
          onClick={() => onSelect(source.id)}
          onDragStart={event => {
            event.dataTransfer.setData(LAB_BIND_MIME, `source:${source.id}`)
            event.dataTransfer.effectAllowed = "copy"
          }}
        >
          <span className="pt-source-grip" aria-hidden>
            ⠇
          </span>
          <span className={`pt-source-kind is-${sourceKind(source, index)}`}>
            {sourceKind(source, index)}
          </span>
          <span className="pt-source-label">{source.label}</span>
        </div>
      ))}
    </div>
  )
}
