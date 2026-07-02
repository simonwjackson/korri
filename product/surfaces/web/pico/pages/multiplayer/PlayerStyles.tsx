/**
 * pico surface. ATOMIC LAYER: page.
 * Player style comparison. Reads `picoPlayersAtom`.
 */
import { picoPlayersAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { PlayerStyleMatrix } from "../../ui/organisms/PlayerStyleMatrix"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function PlayerStyles() {
  return (
    <PicoData atom={picoPlayersAtom} title="PICO ▸ PLAYER STYLES">
      {players => (
        <ScreenShell
          title="PICO ▸ PLAYER STYLES"
          hints={[{ key: "a", label: "PICK STYLE" }]}
        >
          <PlayerStyleMatrix players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
