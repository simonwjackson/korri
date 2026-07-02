/**
 * pico surface. ATOMIC LAYER: page.
 * Host list. Reads `picoHostsAtom`.
 */
import { picoHostsAtom } from "../../data/pico-devices-atoms"
import { PicoData } from "../../screens/PicoData"
import { HostCardList } from "../../ui/organisms/HostCardList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function HostList() {
  return (
    <PicoData atom={picoHostsAtom} title="PICO ▸ HOSTS">
      {hosts => (
        <ScreenShell
          title="PICO ▸ HOSTS"
          hints={[
            { key: "a", label: "CONNECT" },
            { key: "b", label: "BACK" },
          ]}
        >
          <HostCardList hosts={hosts} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
