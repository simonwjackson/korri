/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: template.
 *
 * Reusable push-drawer shell for PANELS screens: a `container-type: size` main
 * pane that reflows when the drawer (docked left/right) claims a slice of width,
 * instead of being covered. Layout in screens/panels.css (pcPanel-). Moved from
 * screens/PanelsScreens.tsx.
 */
import type { ReactNode } from "react"
import type { Hint } from "./ScreenShell"
import { ScreenShell } from "./ScreenShell"

export function PanelScreen({
  title,
  hints,
  side = "right",
  panelTitle,
  main,
  panel,
}: {
  readonly title: string
  readonly hints: readonly Hint[]
  readonly side?: "left" | "right"
  readonly panelTitle: string
  readonly main: ReactNode
  readonly panel: ReactNode
}) {
  return (
    <ScreenShell title={title} hints={hints} className="pad-0">
      <div className={`pcPanel ${side}`}>
        <div className="pcPanel-main">{main}</div>
        <aside className={`pcPanel-aside ${side}`}>
          <div className="pcPanel-head">{panelTitle}</div>
          <div className="pcPanel-body">{panel}</div>
        </aside>
      </div>
    </ScreenShell>
  )
}
