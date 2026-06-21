/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Launch gate. Reads `picoHeroAtom`.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { LaunchingStage } from "../../ui/organisms/LaunchingStage"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Launching() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ LAUNCH">
      {game => (
        <ScreenShell
          title="PICO ▸ LAUNCH"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <LaunchingStage game={game} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
