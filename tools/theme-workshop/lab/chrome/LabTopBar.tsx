import type { LabCanvasView, LabChromeMode } from "../model/lab-canvas-state"
import { useLab } from "../Lab.context"
import { labSurfaceAdapters } from "../surface-registry"

const VIEWS: { readonly id: LabCanvasView; readonly label: string }[] = [
  { id: "surface", label: "Surface" },
  { id: "gallery", label: "Gallery" },
  { id: "selection", label: "Selection" },
  { id: "canvas", label: "Canvas" },
  { id: "matrix", label: "Matrix" },
]

export function LabTopBar({
  view,
  onViewChange,
  chromeMode,
  onChromeModeChange,
  chromeVisible,
  onChromeVisibleChange,
}: {
  readonly view: LabCanvasView
  readonly onViewChange: (view: LabCanvasView) => void
  readonly chromeMode: LabChromeMode
  readonly onChromeModeChange: (mode: LabChromeMode) => void
  readonly chromeVisible: boolean
  readonly onChromeVisibleChange: (visible: boolean) => void
}) {
  const { adapter, screens, setThemeId, surfacePath, setSurfacePath } = useLab()
  return (
    <div className="lab-topbar" aria-label="Lab toolbar">
      <strong>dev-lab</strong>
      <label>
        Surface
        <select value={adapter.id} onChange={event => setThemeId(event.target.value)}>
          {labSurfaceAdapters().map(candidate => (
            <option key={candidate.id} value={candidate.id}>{candidate.id}</option>
          ))}
        </select>
      </label>
      <div className="lab-segments" role="group" aria-label="Canvas view">
        {VIEWS.map(candidate => (
          <button
            key={candidate.id}
            type="button"
            className={view === candidate.id ? "is-on" : ""}
            onClick={() => onViewChange(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      {screens.length ? (
        <label>
          Screen
          <select value={surfacePath} onChange={event => setSurfacePath(event.target.value)}>
            {screens.map(screen => (
              <option key={screen.path} value={screen.path}>{screen.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Mode
        <select value={chromeMode} onChange={event => onChromeModeChange(event.target.value as LabChromeMode)}>
          <option value="dock">Dock</option>
          <option value="float">Float</option>
          <option value="focus">Focus</option>
        </select>
      </label>
      <button type="button" onClick={() => onChromeVisibleChange(!chromeVisible)}>
        {chromeVisible ? "Hide UI" : "Show UI"}
      </button>
      <button type="button" onClick={() => void navigator.clipboard?.writeText?.(window.location.href)}>
        Copy link
      </button>
      <span className="lab-route-pill">{surfacePath}</span>
    </div>
  )
}
