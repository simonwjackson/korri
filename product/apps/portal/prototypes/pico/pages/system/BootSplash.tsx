/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Boot splash (static).
 */
import { Spinner } from "../../screens/kit"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function BootSplash() {
  return (
    <ScreenShell className="center pad-0">
      <div className="pcSys-boot">
        <div className="pcSys-logo">KORRI</div>
        <div className="pcSys-boot-sub">PICO EDITION</div>
        <Spinner />
        <div className="pcSys-boot-ver">v2.4.1 · dusting off carts…</div>
      </div>
    </ScreenShell>
  )
}
