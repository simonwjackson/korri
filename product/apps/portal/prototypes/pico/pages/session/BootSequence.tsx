/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Boot sequence. Reads
 * `picoBootStepsAtom`.
 */
import { picoBootStepsAtom } from "../../data/pico-session-atoms"
import { PicoData } from "../../screens/PicoData"
import { BootStepper } from "../../ui/organisms/BootStepper"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function BootSequence() {
  return (
    <PicoData atom={picoBootStepsAtom} title="PICO ▸ SESSION">
      {bootSteps => (
        <ScreenShell
          title="PICO ▸ SESSION"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <BootStepper steps={bootSteps} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
