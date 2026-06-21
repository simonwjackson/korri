/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Art-forward lobby. Reads `picoPartySessionAtom`.
 */
import { picoPartySessionAtom } from "../../data/pico-party-atoms"
import { PicoData } from "../../screens/PicoData"
import { LobbyArtStage } from "../../ui/organisms/LobbyArtStage"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LobbyArt() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ LOBBY">
      {({ game, players }) => (
        <ScreenShell
          title="PICO ▸ LOBBY"
          hints={[
            { key: "a", label: "READY" },
            { key: "y", label: "INVITE" },
            { key: "b", label: "LEAVE" },
          ]}
          className="pad-0"
        >
          <LobbyArtStage game={game} players={players} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
