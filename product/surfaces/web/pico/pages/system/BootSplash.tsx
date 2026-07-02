/**
 * pico surface. ATOMIC LAYER: page. Boot splash (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Spinner } from "../../ui/atoms/Spinner"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function BootSplash() {
  return (
    <ScreenShell className="center pad-0">
      <div
        className="pcSys-boot"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysBoot)}
      >
        <div
          className="pcSys-logo"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysLogo)}
        >
          KORRI
        </div>
        <div
          className="pcSys-boot-sub"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysBootSub)}
        >
          PICO EDITION
        </div>
        <Spinner />
        <div
          className="pcSys-boot-ver"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysBootVer)}
        >
          v2.4.1 · dusting off carts…
        </div>
      </div>
    </ScreenShell>
  )
}
