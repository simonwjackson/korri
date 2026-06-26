import type { LabCanvasView } from "../model/lab-canvas-state"

export function LabFocusRail({
  view,
  onViewChange,
  onShowChrome,
}: {
  readonly view: LabCanvasView
  readonly onViewChange: (view: LabCanvasView) => void
  readonly onShowChrome: () => void
}) {
  return (
    <div className="lab-focusrail" aria-label="Focus commands">
      {(["surface", "gallery", "canvas", "matrix"] as const).map(candidate => (
        <button key={candidate} type="button" className={view === candidate ? "is-on" : ""} onClick={() => onViewChange(candidate)}>
          {candidate}
        </button>
      ))}
      <button type="button" onClick={onShowChrome}>Show UI</button>
    </div>
  )
}
