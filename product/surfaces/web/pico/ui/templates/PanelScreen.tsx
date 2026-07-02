/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: template.
 *
 * Push-drawer shell for PANELS screens. The drawer is a SIBLING of the whole
 * page (status bar + main + button bar), and the page translates off-viewport by
 * the drawer's width — so the entire page, header and footer included, slides
 * aside and its far edge is clipped off the screen (it does NOT reflow narrower).
 * The page shift and drawer width share one `--push-w` so they stay in lockstep.
 * Layout in screens/panels.css (pcPush- / pcPanel-).
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
    <div
      className={`pcPush ${side}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.panelScreen)}
    >
      <div className="pcPush-page">
        <ScreenShell title={title} hints={hints} className="pad-0">
          {main}
        </ScreenShell>
      </div>
      <aside className={`pcPush-aside ${side}`}>
        <div className="pcPanel-head">{panelTitle}</div>
        <div className="pcPanel-body">{panel}</div>
        <div className="pcPush-foot" />
      </aside>
    </div>
  )
}
