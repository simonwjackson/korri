/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Joining a session. Reads `picoPartyGameAtom`.
 */
import { picoPartyGameAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { JoiningStage } from "../../ui/organisms/JoiningStage"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Joining() {
  return (
    <PicoData atom={picoPartyGameAtom} title="PICO ▸ JOINING">
      {game => (
        <ScreenShell
          title="PICO ▸ JOINING"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <JoiningStage game={game} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
