/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: template.
 *
 * Full-bleed in-session overlay: a dimmed running-game backdrop with content
 * floated on top. Used by the HUD and reconnecting screens (the Modal kit
 * component is the other in-session shell).
 */
import type { ReactNode } from "react"

export function GameOverlay({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pc-root">
      <div className="pc-gamebg" />
      {children}
    </div>
  )
}
