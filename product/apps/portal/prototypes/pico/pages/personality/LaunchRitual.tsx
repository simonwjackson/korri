/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * The launch ritual screen. Reads `picoHeroAtom`, composes ScreenShell +
 * LaunchTube.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import { Dim } from "../../screens/kit"
import { PicoData } from "../../screens/PicoData"
import { LaunchTube } from "../../ui/organisms/LaunchTube"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LaunchRitual() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ LAUNCH">
      {game => (
        <ScreenShell
          title="PICO ▸ LAUNCH"
          hints={[{ key: "b", label: "BACK" }]}
          className="center"
        >
          <LaunchTube game={game} />
          <Dim>cartridge insert → CRT power-on</Dim>
        </ScreenShell>
      )}
    </PicoData>
  )
}
