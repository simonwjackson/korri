/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Runtime install. Reads `picoInstallingAtom`.
 */
import { picoInstallingAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { InstallProgress } from "../../ui/organisms/InstallProgress"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Installing() {
  return (
    <PicoData atom={picoInstallingAtom} title="PICO ▸ INSTALL">
      {({ runtimes }) => (
        <ScreenShell
          title="PICO ▸ INSTALL"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <InstallProgress runtime={runtimes[0]} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
