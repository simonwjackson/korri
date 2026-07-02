/**
 * pico surface. ATOMIC LAYER: page. Notification toast (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../../ui/atoms/Badge"
import { Icon } from "../../ui/atoms/Icon"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function NotificationToast() {
  return (
    <ScreenShell
      title="PICO ▸ HOME"
      hints={[
        { key: "a", label: "VIEW" },
        { key: "b", label: "DISMISS" },
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
        className="pcSys-toast"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysToast)}
      >
        <span
          className="pcSys-toast-ico"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysToastIco)}
        >
          <Icon name="download" />
        </span>
        <span
          className="pcSys-toast-text"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysToastText)}
        >
          <b>DOWNLOAD COMPLETE</b>
          Sonic Robo Blast 2 is ready to play
        </span>
        <Badge tone="good">DONE</Badge>
      </div>
    </ScreenShell>
  )
}
