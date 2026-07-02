/**
 * pico surface. ATOMIC LAYER: page.
 * In-session players HUD. Reads `picoPartySessionAtom`.
 */
import { picoPartySessionAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { SessionPlayersHud } from "../../ui/organisms/SessionPlayersHud"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function SessionHud() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ SESSION HUD">
      {({ game, players }) => (
        <ScreenShell className="pad-0">
          <SessionPlayersHud game={game} players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
