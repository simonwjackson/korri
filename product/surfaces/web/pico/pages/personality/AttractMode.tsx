/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Arcade attract mode. Reads `picoGamesAtom`, composes ScreenShell + AttractLoop.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { AttractLoop } from "../../ui/organisms/AttractLoop"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function AttractMode() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ ATTRACT">
      {games => (
        <ScreenShell
          title="PICO ▸ ATTRACT"
          hints={[{ key: "a", label: "PRESS START" }]}
        >
          <AttractLoop games={games} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
