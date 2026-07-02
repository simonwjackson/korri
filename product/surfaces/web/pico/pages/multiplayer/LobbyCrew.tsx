/**
 * pico surface. ATOMIC LAYER: page.
 * Retro "gather your crew" lobby. Reads `picoPlayersAtom`.
 */
import { picoPlayersAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { CrewLobby } from "../../ui/organisms/CrewLobby"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LobbyCrew() {
  return (
    <PicoData atom={picoPlayersAtom} title="PICO ▸ CREW">
      {players => (
        <ScreenShell
          title="PICO ▸ CREW"
          hints={[
            { key: "a", label: "READY UP" },
            { key: "b", label: "BAIL" },
          ]}
          className="pad-0"
        >
          <CrewLobby players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
