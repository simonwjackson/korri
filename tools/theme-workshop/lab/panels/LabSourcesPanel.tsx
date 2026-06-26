import type { LabSourceOption } from "../model/lab-source-state"

export const LAB_BIND_MIME = "application/x-korri-lab-bind"

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
    <div className="lab-panel-stack">
      <div className="lab-panel-hint">Where data comes from. Drag onto a preview, or use its menu.</div>
      {sources.map(source => (
        <div
          key={source.id}
          className={`lab-bind-row${activeId === source.id ? " is-on" : ""}`}
          draggable
          onClick={() => onSelect(source.id)}
          onDragStart={event => {
            event.dataTransfer.setData(LAB_BIND_MIME, `source:${source.id}`)
            event.dataTransfer.effectAllowed = "copy"
          }}
        >
          <span aria-hidden>⠇</span>
          <strong>{source.label}</strong>
          {source.description ? <small>{source.description}</small> : null}
        </div>
      ))}
    </div>
  )
}
