/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Notification toast (static).
 */
import { Badge } from "../../screens/kit"
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
      <div className="pcSys-stub pc-fill">
        <div className="pc-dim">…home surface behind…</div>
      </div>
      <div className="pcSys-toast">
        <span className="pcSys-toast-ico">
          <Icon name="download" />
        </span>
        <span className="pcSys-toast-text">
          <b>DOWNLOAD COMPLETE</b>
          Sonic Robo Blast 2 is ready to play
        </span>
        <Badge tone="good">DONE</Badge>
      </div>
    </ScreenShell>
  )
}
