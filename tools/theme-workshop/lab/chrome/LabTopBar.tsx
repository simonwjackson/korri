import { Settings } from "lucide-react"
import type { ScreenConfig } from "../../device-lab"
import { LabDeviceSelect } from "../components/LabDeviceSelect"
import { LabScreenSelect } from "../components/LabScreenSelect"
import { useLab } from "../Lab.context"
import type { LabChromeMode } from "../model/lab-canvas-state"
import { labSurfaceAdapters } from "../surface-registry"

const MODES: readonly LabChromeMode[] = ["dock", "float", "focus"]

export function LabTopBar({
  chromeMode,
  onChromeModeChange,
  onHideChrome,
  onOpenSettings,
  compact,
  screenChoices,
  activeScreenId,
  onScreenChange,
}: {
  readonly chromeMode: LabChromeMode
  readonly onChromeModeChange: (mode: LabChromeMode) => void
  readonly onHideChrome: () => void
  readonly onOpenSettings: () => void
  readonly compact: boolean
  /** Compose-only logical screen choices for a multi-screen device; omit otherwise. */
  readonly screenChoices?: readonly ScreenConfig[]
  readonly activeScreenId?: string
  readonly onScreenChange?: (id: string) => void
}) {
  const { adapter, setThemeId } = useLab()
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
          <LabDeviceSelect />
          {screenChoices &&
          screenChoices.length > 1 &&
          activeScreenId &&
          onScreenChange ? (
            <LabScreenSelect
              screens={screenChoices}
              activeId={activeScreenId}
              onChange={onScreenChange}
            />
          ) : null}
          <label className="pt-surface-select">
            Surface
            <select
              value={adapter.id}
              onChange={event => setThemeId(event.target.value)}
            >
              {labSurfaceAdapters().map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="pt-topbar-gear"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Settings size={16} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" className="pt-eye" onClick={onHideChrome}>
          Hide UI
        </button>
      </div>
    </header>
  )
}
