/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Active download. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { DownloadProgress } from "../../ui/organisms/DownloadProgress"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Downloading() {
  return (
    <PicoData atom={picoAcquireTargetAtom} title="PICO ▸ DOWNLOAD">
      {target => (
        <ScreenShell
          title="PICO ▸ DOWNLOAD"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <DownloadProgress target={target} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
