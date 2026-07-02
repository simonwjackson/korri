/**
 * pico surface. ATOMIC LAYER: page. Developer ISO badge (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
      <div
        className="pcSys-stub pc-fill"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysStub)}
      >
        <div className="pc-dim" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}>
          …home surface behind…
        </div>
      </div>
      <div
        className="pcSys-devbadge"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysDevbadge)}
      >
        DEVELOPER ISO · BROAD PERSISTENCE
      </div>
    </ScreenShell>
  )
}
