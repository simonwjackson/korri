/**
 * pico surface. ATOMIC LAYER: page.
 * Stream host discovery. Reads `picoHostsAtom`.
 */
import { picoHostsAtom } from "../../data/pico-devices-atoms"
import { PicoData } from "../../screens/PicoData"
import { HostScanList } from "../../ui/organisms/HostScanList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function HostDiscovery() {
  return (
    <PicoData atom={picoHostsAtom} title="PICO ▸ HOSTS · SCAN">
      {hosts => (
        <ScreenShell
          title="PICO ▸ HOSTS · SCAN"
          hints={[{ key: "b", label: "CANCEL" }]}
        >
          <HostScanList hosts={hosts} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
