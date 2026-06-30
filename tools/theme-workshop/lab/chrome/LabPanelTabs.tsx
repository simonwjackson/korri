import { useState } from "react"
import type { LabChromePanel } from "./lab-chrome-types"

/**
 * Shared tabbed panel body for the compact chrome designs. Holds only its own
 * active-tab UI state; the panels themselves are passed in. Reused by the bottom
 * bar's drawer and the immersive overlay so the tab behavior lives in one place.
 */
export function LabPanelTabs({
  panels,
}: {
  readonly panels: readonly LabChromePanel[]
}) {
  const [tab, setTab] = useState(panels[0]?.id ?? "")
  const active = panels.find(panel => panel.id === tab) ?? panels[0]
  return (
    <>
      <div className="pt-sheet-tabs" role="tablist" aria-label="Panels">
        {panels.map(panel => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={active?.id === panel.id}
            className={`pt-sheet-tab${active?.id === panel.id ? " is-on" : ""}`}
            onClick={() => setTab(panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {active?.action ? (
        <div className="pt-sheet-actions">{active.action}</div>
      ) : null}
      <div className="pt-sheet-body">{active?.render()}</div>
    </>
  )
}
