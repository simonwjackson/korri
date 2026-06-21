/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Developer ISO badge (static).
 */
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DeveloperBadge() {
  return (
    <ScreenShell
      title="PICO ▸ HOME"
      hints={[
        { key: "a", label: "PLAY" },
        { key: "y", label: "OPTIONS" },
      ]}
    >
      <div className="pcSys-stub pc-fill">
        <div className="pc-dim">…home surface behind…</div>
      </div>
      <div className="pcSys-devbadge">DEVELOPER ISO · BROAD PERSISTENCE</div>
    </ScreenShell>
  )
}
