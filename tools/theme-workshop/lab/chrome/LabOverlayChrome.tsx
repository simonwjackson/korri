import { SlidersHorizontal, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import { LabPanelTabs } from "./LabPanelTabs"
import type { LabChromePanel } from "./lab-chrome-types"

/**
 * Overlay chrome: zero persistent bar. A subtle summon pill opens one sheet
 * holding the same controls (as its head) and the same panels (tabbed). Maximum
 * canvas real estate; the controls reflow into the sheet instead of a bar.
 */
export function LabOverlayChrome({
  controls,
  panels,
}: {
  readonly controls: ReactNode
  readonly panels: readonly LabChromePanel[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="pt-summon"
        aria-label="Open lab controls"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={17} aria-hidden />
      </button>
      {open ? (
        <div className="pt-overlay" role="dialog" aria-label="Lab controls">
          <button
            type="button"
            className="pt-overlay-scrim"
            aria-label="Close controls"
            onClick={() => setOpen(false)}
          />
          <div className="pt-overlay-panel">
            <div className="pt-overlay-head">
              {controls}
              <button
                type="button"
                className="pt-ctl-icon"
                aria-label="Close controls"
                onClick={() => setOpen(false)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <LabPanelTabs panels={panels} />
          </div>
        </div>
      ) : null}
    </>
  )
}
