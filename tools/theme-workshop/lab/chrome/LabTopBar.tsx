import type { LabChromeMode } from "../model/lab-canvas-state"
import { useLab } from "../Lab.context"
import { labSurfaceAdapters } from "../surface-registry"

const MODES: readonly LabChromeMode[] = ["dock", "float", "focus"]

export function LabTopBar({
  chromeMode,
  onChromeModeChange,
  onHideChrome,
  compact,
}: {
  readonly chromeMode: LabChromeMode
  readonly onChromeModeChange: (mode: LabChromeMode) => void
  readonly onHideChrome: () => void
  readonly compact: boolean
}) {
  const { adapter, screens, setThemeId, surfacePath, setSurfacePath } = useLab()
  return (
    <header className="pt-topbar">
      <div className="pt-brand">
        <span className="pt-brand-dot" />
        Korri Lab
        <span className="pt-brand-sub">dev-lab</span>
      </div>

      {compact ? null : (
        <div className="pt-seg" role="tablist" aria-label="Layout direction">
          {MODES.map(mode => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={chromeMode === mode}
              className={`pt-seg-btn${chromeMode === mode ? " is-on" : ""}`}
              onClick={() => onChromeModeChange(mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="pt-topbar-right">
        <div className="lab-topbar-extra">
          <label className="pt-surface-select">
            Surface
            <select value={adapter.id} onChange={event => setThemeId(event.target.value)}>
              {labSurfaceAdapters().map(candidate => (
                <option key={candidate.id} value={candidate.id}>{candidate.id}</option>
              ))}
            </select>
          </label>
          {screens.length ? (
            <label className="pt-surface-select">
              Screen
              <select value={surfacePath} onChange={event => setSurfacePath(event.target.value)}>
                {screens.map(screen => (
                  <option key={screen.path} value={screen.path}>{screen.label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <button type="button" className="pt-eye" onClick={() => void navigator.clipboard?.writeText?.(window.location.href)}>
          Copy link
        </button>
        <button type="button" className="pt-eye" onClick={onHideChrome}>
          Hide UI
        </button>
      </div>
    </header>
  )
}
