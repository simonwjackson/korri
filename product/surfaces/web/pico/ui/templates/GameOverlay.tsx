/**
 * pico surface. ATOMIC LAYER: template.
 *
 * Full-bleed in-session overlay: a dimmed running-game backdrop with content
 * floated on top. Used by the HUD and reconnecting screens (the Modal kit
 * component is the other in-session shell).
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function GameOverlay({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className="pc-root"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.gameOverlay)}
    >
      <div
        className="pc-gamebg"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcGamebg)}
      />
      {children}
    </div>
  )
}
