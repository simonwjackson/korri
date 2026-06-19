/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Power menu (static).
 */
import { List, Row } from "../../screens/kit"
import { Icon } from "../../ui/atoms/Icon"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function PowerMenu() {
  return (
    <ScreenShell title="PICO ▸ POWER" hints={[{ key: "b", label: "CANCEL" }]}>
      <div className="pcSys-power">
        <List>
          <Row
            icon={<Icon name="moon" />}
            label="SLEEP"
            meta="Suspend to RAM, resume instantly"
            sel
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
