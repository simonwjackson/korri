import type { LabCanvasView } from "../model/lab-canvas-state"
import type { LabChromeView } from "./lab-chrome-types"

/** Device ⇄ Compose canvas-view switch. Shared across every chrome position. */
export function LabViewToggle({
  views,
  view,
  onChange,
}: {
  readonly views: readonly LabChromeView[]
  readonly view: LabCanvasView
  readonly onChange: (id: LabCanvasView) => void
}) {
  return (
    <div className="pt-seg pt-seg-sm" role="tablist" aria-label="View">
      {views.map(candidate => (
        <button
          key={candidate.id}
          type="button"
          role="tab"
          aria-selected={view === candidate.id}
          className={`pt-seg-btn${view === candidate.id ? " is-on" : ""}`}
          onClick={() => onChange(candidate.id)}
        >
          {candidate.label}
        </button>
      ))}
    </div>
  )
}
