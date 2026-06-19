/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Dual-screen primary. Reads `picoHeroAtom`.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { DualPrimaryStage } from "../../ui/organisms/DualPrimaryStage"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DualPrimary() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ DUAL · PRIMARY">
      {hero => (
        <ScreenShell
          title="PICO ▸ DUAL · PRIMARY"
          hints={[
            { key: "a", label: "LAUNCH" },
            { key: "y", label: "SWAP" },
          ]}
        >
          <DualPrimaryStage hero={hero} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
