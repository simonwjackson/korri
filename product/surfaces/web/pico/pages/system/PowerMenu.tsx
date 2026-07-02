/**
 * pico surface. ATOMIC LAYER: page. Power menu (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Icon } from "../../ui/atoms/Icon"
import { List } from "../../ui/molecules/List"
import { Row } from "../../ui/molecules/Row"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function PowerMenu() {
  return (
    <ScreenShell title="PICO ▸ POWER" hints={[{ key: "b", label: "CANCEL" }]}>
      <div
        className="pcSys-power"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysPower)}
      >
        <List>
          <Row
            icon={<Icon name="moon" />}
            label="SLEEP"
            meta="Suspend to RAM, resume instantly"
            state="selected"
          />
          <Row
            icon={<Icon name="restart" />}
            label="RESTART"
            meta="Reboot the device"
          />
          <Row
            icon={<Icon name="power" />}
            label="SHUT DOWN"
            meta="Power off completely"
          />
          <Row
            icon={<Icon name="exit" />}
            label="RETURN TO DESKTOP"
            meta="Exit to host shell"
          />
        </List>
      </div>
    </ScreenShell>
  )
}
