/**
 * pico surface. ATOMIC LAYER: page.
 * Players & Devices hub. Reads `picoPartyHubAtom`.
 */
import { picoPartyHubAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { PlayersHub } from "../../ui/organisms/PlayersHub"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Hub() {
  return (
    <PicoData atom={picoPartyHubAtom} title="PICO ▸ PLAYERS">
      {({ game, players, friends }) => (
        <ScreenShell
          title="PICO ▸ PLAYERS"
          hints={[
            { key: "a", label: "OPEN" },
            { key: "y", label: "START SESSION" },
            { key: "b", label: "BACK" },
          ]}
        >
          <PlayersHub game={game} players={players} friends={friends} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
