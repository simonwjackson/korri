/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * A centered modal / sheet over a dimmed game backdrop. Moved from `kit.tsx`.
 */
import type { ReactNode } from "react"
import { PicoButtonBar } from "../../PicoStatusBar"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import type { Hint } from "../templates/ScreenShell"

export function Modal({
  title,
  children,
  hints,
}: {
  readonly title?: ReactNode
  readonly children: ReactNode
  readonly hints?: readonly Hint[]
}) {
  return (
    <div className="pc-root" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.modal)}>
      <div className="pc-gamebg" />
      <div className="pc-modal">
        <div className="pc-modal-panel">
          {title !== undefined ? (
            <div className="pc-modal-title">{title}</div>
          ) : null}
          {children}
        </div>
      </div>
      {hints ? <PicoButtonBar hints={hints} /> : null}
    </div>
  )
}
