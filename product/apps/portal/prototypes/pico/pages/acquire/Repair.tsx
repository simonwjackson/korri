/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Repair / verify. Reads `picoAcquireTargetAtom`.
 */
import { picoAcquireTargetAtom } from "../../data/pico-detail-atoms"
import { PicoData } from "../../screens/PicoData"
import { RepairProgress } from "../../ui/organisms/RepairProgress"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Repair() {
  return (
    <PicoData atom={picoAcquireTargetAtom} title="PICO ▸ REPAIR">
      {target => (
        <ScreenShell
          title="PICO ▸ REPAIR"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <RepairProgress target={target} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
