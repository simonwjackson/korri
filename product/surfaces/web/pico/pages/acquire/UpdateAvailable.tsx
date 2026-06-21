/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Update available. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { UpdatePanel } from "../../ui/organisms/UpdatePanel"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function UpdateAvailable() {
  return (
    <PicoData atom={picoAcquireTargetAtom} title="PICO ▸ UPDATE">
      {target => (
        <ScreenShell
          title="PICO ▸ UPDATE"
          hints={[
            { key: "a", label: "UPDATE" },
            { key: "b", label: "SKIP" },
          ]}
        >
          <UpdatePanel target={target} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
