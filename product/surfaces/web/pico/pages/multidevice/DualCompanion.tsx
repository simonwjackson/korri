/**
 * pico surface. ATOMIC LAYER: page.
 * Dual-screen companion (full-bleed). Reads `picoHeroAtom`.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { CompanionCard } from "../../ui/organisms/CompanionCard"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DualCompanion() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ DUAL · COMPANION">
      {hero => (
        <ScreenShell className="pad-0">
          <CompanionCard hero={hero} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
