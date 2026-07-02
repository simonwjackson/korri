/**
 * pico surface. ATOMIC LAYER: page.
 * Player-joined toast. Reads `picoPartySessionAtom`.
 */
import { picoPartySessionAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { PlayerToast as PlayerToastBody } from "../../ui/organisms/PlayerToast"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function PlayerToast() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ TOAST">
      {({ game, players }) => (
        <ScreenShell className="pad-0">
          <PlayerToastBody game={game} players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
